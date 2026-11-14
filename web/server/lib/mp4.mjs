// Fragmented MP4 helpers.
//  - BoxSplitter: splits ffmpeg's output stream into top-level boxes.
//  - parseInit: track ids, timescales, defaults and edit lists (each track's absolute start time).
//  - canonicalInit: init segment without edit lists / durations, identical for every ffmpeg run.
//  - parseFragment: the samples of one moof+mdat (timing, flags, data).
//  - buildFragment: writes one moof+mdat from samples (used for every HLS segment).

/** Incremental top-level box splitter for a byte stream. */
export class BoxSplitter {
  constructor() {
    this.chunks = [];
    this.len = 0;
  }

  /** Adds bytes; returns the complete top-level boxes found so far as {type, buf}. */
  push(chunk) {
    this.chunks.push(chunk);
    this.len += chunk.length;
    const out = [];
    for (;;) {
      if (this.len < 8) break;
      // only look at the header first, so big mdat boxes are not re-concatenated on every chunk
      let headBuf = this.chunks[0];
      if (headBuf.length < 16 && this.chunks.length > 1) {
        headBuf = Buffer.concat(this.chunks, this.len);
        this.chunks = [headBuf];
      }
      let size = headBuf.readUInt32BE(0);
      if (size === 1) {
        if (headBuf.length < 16) break;
        size = Number(headBuf.readBigUInt64BE(8));
      } else if (size === 0) {
        break; // "to end of stream": never written by ffmpeg's fragmented mp4 to a pipe
      }
      if (size < 8) throw new Error('bad box size in ffmpeg output');
      if (this.len < size) break;
      const buf = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks, this.len);
      out.push({ type: buf.toString('latin1', 4, 8), buf: buf.subarray(0, size) });
      const rest = buf.subarray(size);
      this.chunks = rest.length ? [rest] : [];
      this.len = rest.length;
    }
    return out;
  }
}

function* boxes(buf, start, end) {
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    let hdr = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(pos + 8)); hdr = 16; } else if (size === 0) size = end - pos;
    if (size < hdr || pos + size > end) return;
    yield { type: buf.toString('latin1', pos + 4, pos + 8), start: pos, dataStart: pos + hdr, end: pos + size };
    pos += size;
  }
}

function child(buf, parent, type) {
  for (const b of boxes(buf, parent.dataStart, parent.end)) if (b.type === type) return b;
  return null;
}

/**
 * Track info from an init segment (ftyp+moov): Map trackId -> {trackId, handler, timescale,
 * startSec (sum of empty edits = presentation time of the first sample), mediaTime (units),
 * trex defaults}.
 */
export function parseInit(buf) {
  const tracks = new Map();
  let moov = null;
  for (const b of boxes(buf, 0, buf.length)) if (b.type === 'moov') moov = b;
  if (!moov) throw new Error('no moov in init segment');
  let movieTimescale = 1000;
  const trex = new Map();
  for (const b of boxes(buf, moov.dataStart, moov.end)) {
    if (b.type === 'mvhd') {
      const v = buf[b.dataStart];
      movieTimescale = buf.readUInt32BE(b.dataStart + (v === 1 ? 20 : 12));
    }
  }
  for (const b of boxes(buf, moov.dataStart, moov.end)) {
    if (b.type === 'trak') {
      const tkhd = child(buf, b, 'tkhd');
      const mdia = child(buf, b, 'mdia');
      if (!tkhd || !mdia) continue;
      const tv = buf[tkhd.dataStart];
      const trackId = buf.readUInt32BE(tkhd.dataStart + (tv === 1 ? 20 : 12));
      const mdhd = child(buf, mdia, 'mdhd');
      const hdlr = child(buf, mdia, 'hdlr');
      const mv = buf[mdhd.dataStart];
      const timescale = buf.readUInt32BE(mdhd.dataStart + (mv === 1 ? 20 : 12));
      const handler = buf.toString('latin1', hdlr.dataStart + 8, hdlr.dataStart + 12);
      let emptyUnits = 0;
      let mediaTime = 0;
      const edts = child(buf, b, 'edts');
      const elst = edts ? child(buf, edts, 'elst') : null;
      if (elst) {
        const v = buf[elst.dataStart];
        const n = buf.readUInt32BE(elst.dataStart + 4);
        let p = elst.dataStart + 8;
        let gotMedia = false;
        for (let i = 0; i < n; i++) {
          const dur = v === 1 ? Number(buf.readBigUInt64BE(p)) : buf.readUInt32BE(p);
          const mt = v === 1 ? Number(buf.readBigInt64BE(p + 8)) : buf.readInt32BE(p + 4);
          p += v === 1 ? 20 : 12;
          if (mt === -1) { if (!gotMedia) emptyUnits += dur; } else if (!gotMedia) { mediaTime = mt; gotMedia = true; }
        }
      }
      tracks.set(trackId, {
        trackId, handler, timescale,
        startSec: emptyUnits / movieTimescale,
        mediaTime,
        defaultDuration: 0, defaultSize: 0, defaultFlags: 0,
      });
    } else if (b.type === 'mvex') {
      for (const t of boxes(buf, b.dataStart, b.end)) {
        if (t.type === 'trex') {
          const d = t.dataStart;
          trex.set(buf.readUInt32BE(d + 4), { dur: buf.readUInt32BE(d + 12), size: buf.readUInt32BE(d + 16), flags: buf.readUInt32BE(d + 20) });
        }
      }
    }
  }
  for (const [id, d] of trex) {
    const t = tracks.get(id);
    if (t) { t.defaultDuration = d.dur; t.defaultSize = d.size; t.defaultFlags = d.flags; }
  }
  return tracks;
}

function box(type, ...parts) {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

/** Zeroes the duration field of a mvhd/mdhd/tkhd/mehd box copy. */
function zeroDuration(type, b) {
  const v = b[8];
  if (type === 'mvhd' || type === 'mdhd') {
    if (v === 1) b.writeBigUInt64BE(0n, 8 + 4 + 20); else b.writeUInt32BE(0, 8 + 4 + 12);
  } else if (type === 'tkhd') {
    if (v === 1) b.writeBigUInt64BE(0n, 8 + 4 + 28); else b.writeUInt32BE(0, 8 + 4 + 20);
  } else if (type === 'mehd') {
    if (v === 1) b.writeBigUInt64BE(0n, 12); else b.writeUInt32BE(0, 12);
  }
  return b;
}

function rebuild(buf, start, end) {
  const out = [];
  for (const b of boxes(buf, start, end)) {
    if (b.type === 'edts') continue;
    if (['trak', 'mdia', 'mvex'].includes(b.type)) {
      out.push(box(b.type, ...rebuild(buf, b.dataStart, b.end)));
    } else if (['mvhd', 'tkhd', 'mdhd', 'mehd'].includes(b.type)) {
      out.push(zeroDuration(b.type, Buffer.from(buf.subarray(b.start, b.end))));
    } else {
      out.push(buf.subarray(b.start, b.end));
    }
  }
  return out;
}

/** ftyp + moov with edit lists removed and durations zeroed: the same for every run of a file. */
export function canonicalInit(buf) {
  const out = [];
  for (const b of boxes(buf, 0, buf.length)) {
    if (b.type === 'ftyp') out.push(buf.subarray(b.start, b.end));
    else if (b.type === 'moov') out.push(box('moov', ...rebuild(buf, b.dataStart, b.end)));
  }
  return Buffer.concat(out);
}

/** Track ids, handlers and sample descriptions must match for two inits to be interchangeable. */
export function initSignature(buf) {
  const parts = [];
  const walk = (start, end) => {
    for (const b of boxes(buf, start, end)) {
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(b.type)) walk(b.dataStart, b.end);
      else if (b.type === 'stsd' || b.type === 'hdlr') parts.push(buf.subarray(b.start, b.end).toString('base64'));
      else if (b.type === 'mdhd') { const v = buf[b.dataStart]; parts.push('ts' + buf.readUInt32BE(b.dataStart + (v === 1 ? 20 : 12))); }
    }
  };
  walk(0, buf.length);
  return parts.join('|');
}

export const SAMPLE_NON_SYNC = 0x00010000;

/**
 * Samples of one fragment. moof and mdat are separate buffers (mdat directly follows moof).
 * Returns Map trackId -> [{dts (track units, as written by ffmpeg), dur, size, flags, cts, data}].
 */
export function parseFragment(moof, mdat, tracks) {
  const out = new Map();
  const mdatHdr = mdat.readUInt32BE(0) === 1 ? 16 : 8;
  // byte offset (relative to moof start) -> slice of mdat
  const slice = (offset, size) => {
    const rel = offset - moof.length;
    if (rel < mdatHdr || rel + size > mdat.length) throw new Error('sample data outside mdat');
    return mdat.subarray(rel, rel + size);
  };
  const moofStart = moof.readUInt32BE(0) === 1 ? 16 : 8;
  let prevEnd = moof.length + mdatHdr; // implicit base for trafs without explicit base
  let firstTraf = true;
  for (const b of boxes(moof, moofStart, moof.length)) {
    if (b.type !== 'traf') continue;
    let trackId = 0;
    let tfhdFlags = 0;
    let base = -1;
    let dDur = 0;
    let dSize = 0;
    let dFlags = 0;
    let dts = 0;
    let track = null;
    const samples = [];
    for (const c of boxes(moof, b.dataStart, b.end)) {
      if (c.type === 'tfhd') {
        tfhdFlags = moof.readUIntBE(c.dataStart + 1, 3);
        trackId = moof.readUInt32BE(c.dataStart + 4);
        track = tracks.get(trackId);
        dDur = track?.defaultDuration || 0;
        dSize = track?.defaultSize || 0;
        dFlags = track?.defaultFlags || 0;
        let p = c.dataStart + 8;
        if (tfhdFlags & 0x01) { base = Number(moof.readBigUInt64BE(p)); p += 8; }
        if (tfhdFlags & 0x02) p += 4;
        if (tfhdFlags & 0x08) { dDur = moof.readUInt32BE(p); p += 4; }
        if (tfhdFlags & 0x10) { dSize = moof.readUInt32BE(p); p += 4; }
        if (tfhdFlags & 0x20) { dFlags = moof.readUInt32BE(p); p += 4; }
        if (tfhdFlags & 0x01) throw new Error('explicit base data offsets are not supported');
        // default-base-is-moof, or (first traf without a base) the moof start; otherwise the end of
        // the previous traf's data
        base = (tfhdFlags & 0x020000) || firstTraf ? 0 : prevEnd;
        firstTraf = false;
      } else if (c.type === 'tfdt') {
        dts = moof[c.dataStart] === 1 ? Number(moof.readBigUInt64BE(c.dataStart + 4)) : moof.readUInt32BE(c.dataStart + 4);
      } else if (c.type === 'trun') {
        const version = moof[c.dataStart];
        const flags = moof.readUIntBE(c.dataStart + 1, 3);
        const count = moof.readUInt32BE(c.dataStart + 4);
        let p = c.dataStart + 8;
        let offset = samples.length ? prevEnd : base;
        if (flags & 0x01) { offset = base + moof.readInt32BE(p); p += 4; }
        let firstFlags = -1;
        if (flags & 0x04) { firstFlags = moof.readUInt32BE(p); p += 4; }
        for (let i = 0; i < count; i++) {
          let dur = dDur;
          let size = dSize;
          let sflags = i === 0 && firstFlags >= 0 ? firstFlags : dFlags;
          let cts = 0;
          if (flags & 0x100) { dur = moof.readUInt32BE(p); p += 4; }
          if (flags & 0x200) { size = moof.readUInt32BE(p); p += 4; }
          if (flags & 0x400) { sflags = moof.readUInt32BE(p); p += 4; }
          if (flags & 0x800) { cts = version === 0 ? moof.readUInt32BE(p) : moof.readInt32BE(p); p += 4; }
          samples.push({ dts, dur, size, flags: sflags, cts, data: slice(offset, size) });
          dts += dur;
          offset += size;
        }
        prevEnd = offset;
      }
    }
    if (trackId) out.set(trackId, (out.get(trackId) || []).concat(samples));
  }
  return out;
}

/**
 * Writes one moof+mdat. `trafs` = [{trackId, baseDts, samples:[{dur, size, flags, cts, data}]}].
 * Every sample field is written explicitly, so the init's defaults never matter.
 */
export function buildFragment(sequence, trafs) {
  trafs = trafs.filter((t) => t.samples.length);
  const mfhd = Buffer.alloc(16);
  mfhd.writeUInt32BE(16, 0); mfhd.write('mfhd', 4, 'latin1'); mfhd.writeUInt32BE(sequence >>> 0, 12);
  // sizes are fixed (every field explicit), so the data offsets are known before building the boxes
  const moofLen = 8 + mfhd.length + trafs.reduce((a, t) => a + 8 + 16 + 20 + 20 + 16 * t.samples.length, 0);
  let dataPos = moofLen + 8;
  const trafBufs = [];
  for (const t of trafs) {
    const n = t.samples.length;
    const negative = t.samples.some((s) => s.cts < 0);
    const tfhd = Buffer.alloc(16);
    tfhd.writeUInt32BE(16, 0); tfhd.write('tfhd', 4, 'latin1');
    tfhd.writeUInt32BE(0x020000, 8); // default-base-is-moof
    tfhd.writeUInt32BE(t.trackId, 12);
    const tfdt = Buffer.alloc(20);
    tfdt.writeUInt32BE(20, 0); tfdt.write('tfdt', 4, 'latin1');
    tfdt.writeUInt32BE(0x01000000, 8);
    tfdt.writeBigUInt64BE(BigInt(t.baseDts), 12);
    const trun = Buffer.alloc(20 + 16 * n);
    trun.writeUInt32BE(trun.length, 0); trun.write('trun', 4, 'latin1');
    trun.writeUInt32BE(((negative ? 1 : 0) << 24) | 0x000f01, 8); // data-offset, duration, size, flags, cts
    trun.writeUInt32BE(n, 12);
    trun.writeInt32BE(dataPos, 16);
    dataPos += t.samples.reduce((a, s) => a + s.size, 0);
    let p = 20;
    for (const s of t.samples) {
      trun.writeUInt32BE(s.dur >>> 0, p);
      trun.writeUInt32BE(s.size >>> 0, p + 4);
      trun.writeUInt32BE(s.flags >>> 0, p + 8);
      if (negative) trun.writeInt32BE(s.cts, p + 12); else trun.writeUInt32BE(s.cts >>> 0, p + 12);
      p += 16;
    }
    trafBufs.push(box('traf', tfhd, tfdt, trun));
  }
  const moof = box('moof', mfhd, ...trafBufs);
  if (moof.length !== moofLen) throw new Error('fragment size mismatch');
  const datas = [];
  for (const t of trafs) for (const s of t.samples) datas.push(s.data);
  const mdatLen = 8 + datas.reduce((a, d) => a + d.length, 0);
  const mdatHead = Buffer.alloc(8);
  mdatHead.writeUInt32BE(mdatLen, 0); mdatHead.write('mdat', 4, 'latin1');
  return Buffer.concat([moof, mdatHead, ...datas]);
}
