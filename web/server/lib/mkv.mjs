// Minimal Matroska (EBML) reader: stream info, tracks and the seek index (Cues), read from the cached
// start/end of the file. Produces the list of video keyframe times that defines the HLS segments.
import { ApiError } from './util.mjs';

const ID = {
  EBML: 0x1a45dfa3, DocType: 0x4282,
  Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimestampScale: 0x2ad7b1, Duration: 0x4489,
  Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackType: 0x83, CodecID: 0x86,
  DefaultDuration: 0x23e383, Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba,
  Audio: 0xe1, SamplingFrequency: 0xb5, Channels: 0x9f, FlagEnabled: 0xb9,
  Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7, CueTrack: 0xf7,
  Cluster: 0x1f43b675,
};

function readId(buf, pos) {
  if (pos >= buf.length) return null;
  const b = buf[pos];
  let len = 1;
  for (let mask = 0x80; len <= 4 && !(b & mask); mask >>= 1) len++;
  if (len > 4) throw new Error('bad EBML id');
  if (pos + len > buf.length) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + buf[pos + i];
  return { id, len };
}

function readSize(buf, pos) {
  if (pos >= buf.length) return null;
  const b = buf[pos];
  let len = 1;
  let mask = 0x80;
  for (; len <= 8 && !(b & mask); mask >>= 1) len++;
  if (len > 8) throw new Error('bad EBML size');
  if (pos + len > buf.length) return null;
  let value = b & (mask - 1);
  let allOnes = value === mask - 1;
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { size: allOnes ? -1 : value, len };
}

/** Element header at buf[pos]: {id, dataStart, size, end} (end = -1 for unknown size), or null if cut off. */
function header(buf, pos) {
  const id = readId(buf, pos);
  if (!id) return null;
  const sz = readSize(buf, pos + id.len);
  if (!sz) return null;
  const dataStart = pos + id.len + sz.len;
  return { id: id.id, dataStart, size: sz.size, end: sz.size < 0 ? -1 : dataStart + sz.size };
}

function* children(buf, start, end) {
  let pos = start;
  while (pos < end) {
    const h = header(buf, pos);
    if (!h || h.end < 0 || h.end > end) return;
    yield h;
    pos = h.end;
  }
}

const uint = (buf, h) => { let v = 0; for (let i = h.dataStart; i < h.end; i++) v = v * 256 + buf[i]; return v; };
const float = (buf, h) => (h.size === 4 ? buf.readFloatBE(h.dataStart) : h.size === 8 ? buf.readDoubleBE(h.dataStart) : 0);
const str = (buf, h) => buf.toString('latin1', h.dataStart, h.end).replace(/\0+$/, '');

function parseSeekHead(buf, h) {
  const map = new Map();
  for (const seek of children(buf, h.dataStart, h.end)) {
    if (seek.id !== ID.Seek) continue;
    let id = 0;
    let pos = -1;
    for (const c of children(buf, seek.dataStart, seek.end)) {
      if (c.id === ID.SeekID) id = uint(buf, c);
      else if (c.id === ID.SeekPosition) pos = uint(buf, c);
    }
    if (id && pos >= 0 && !map.has(id)) map.set(id, pos);
  }
  return map;
}

function parseInfo(buf, h) {
  const info = { timestampScale: 1000000, duration: 0 };
  for (const c of children(buf, h.dataStart, h.end)) {
    if (c.id === ID.TimestampScale) info.timestampScale = uint(buf, c) || 1000000;
    else if (c.id === ID.Duration) info.duration = float(buf, c);
  }
  return info;
}

function parseTracks(buf, h) {
  const tracks = [];
  for (const te of children(buf, h.dataStart, h.end)) {
    if (te.id !== ID.TrackEntry) continue;
    const t = { number: 0, type: 0, codecId: '', enabled: true, defaultDuration: 0, width: 0, height: 0, channels: 0, sampleRate: 0 };
    for (const c of children(buf, te.dataStart, te.end)) {
      if (c.id === ID.TrackNumber) t.number = uint(buf, c);
      else if (c.id === ID.TrackType) t.type = uint(buf, c);
      else if (c.id === ID.CodecID) t.codecId = str(buf, c);
      else if (c.id === ID.FlagEnabled) t.enabled = uint(buf, c) !== 0;
      else if (c.id === ID.DefaultDuration) t.defaultDuration = uint(buf, c);
      else if (c.id === ID.Video) {
        for (const v of children(buf, c.dataStart, c.end)) {
          if (v.id === ID.PixelWidth) t.width = uint(buf, v);
          else if (v.id === ID.PixelHeight) t.height = uint(buf, v);
        }
      } else if (c.id === ID.Audio) {
        for (const a of children(buf, c.dataStart, c.end)) {
          if (a.id === ID.Channels) t.channels = uint(buf, a);
          else if (a.id === ID.SamplingFrequency) t.sampleRate = float(buf, a);
        }
      }
    }
    if (!t.channels && t.type === 2) t.channels = 1;
    tracks.push(t);
  }
  return tracks;
}

function parseCues(buf, h, trackNumber) {
  const times = [];
  for (const cp of children(buf, h.dataStart, h.end)) {
    if (cp.id !== ID.CuePoint) continue;
    let time = -1;
    let hit = false;
    for (const c of children(buf, cp.dataStart, cp.end)) {
      if (c.id === ID.CueTime) time = uint(buf, c);
      else if (c.id === ID.CueTrackPositions) {
        for (const p of children(buf, c.dataStart, c.end)) {
          if (p.id === ID.CueTrack && uint(buf, p) === trackNumber) hit = true;
        }
      }
    }
    if (hit && time >= 0) times.push(time);
  }
  return times;
}

const VIDEO_CODECS = { 'V_MPEGH/ISO/HEVC': 'hevc', 'V_MPEG4/ISO/AVC': 'h264', V_AV1: 'av1', V_VP9: 'vp9', V_VP8: 'vp8', 'V_MPEG4/ISO/ASP': 'mpeg4', V_MPEG2: 'mpeg2video' };
function audioCodec(id) {
  if (id.startsWith('A_AAC')) return 'aac';
  const map = { A_AC3: 'ac3', A_EAC3: 'eac3', 'A_MPEG/L3': 'mp3', 'A_MPEG/L2': 'mp2', A_OPUS: 'opus', A_VORBIS: 'vorbis', A_FLAC: 'flac', A_TRUEHD: 'truehd' };
  if (map[id]) return map[id];
  if (id.startsWith('A_DTS')) return 'dts';
  if (id.startsWith('A_PCM')) return 'pcm';
  return id.toLowerCase();
}

/**
 * Reads the index of a Matroska file through `source` (head/tail cached, other ranges fetched).
 * Returns {duration, timestampScale, keyframes[], video:{codec,width,height,track,frameDuration}, audio}.
 */
export async function readMkvIndex(source) {
  const head = source.head;
  const ebml = header(head, 0);
  if (!ebml || ebml.id !== ID.EBML || ebml.end < 0) throw new ApiError('unsupported', 'not a Matroska file');
  let docType = '';
  for (const c of children(head, ebml.dataStart, ebml.end)) if (c.id === ID.DocType) docType = str(head, c);
  if (docType !== 'matroska' && docType !== 'webm') throw new ApiError('unsupported', 'not a Matroska file');
  const seg = header(head, ebml.end);
  if (!seg || seg.id !== ID.Segment) throw new ApiError('unsupported', 'Matroska segment not found');
  const segData = seg.dataStart;

  const found = new Map(); // element id -> {buf, h}
  let seekMap = new Map();
  // walk the top level inside the head until the first cluster
  let pos = segData;
  while (pos < head.length) {
    const h = header(head, pos);
    if (!h || h.end < 0) break;
    if (h.id === ID.Cluster) break;
    if (h.end > head.length) {
      // element larger than the head: fetch it if it is one we need
      if ([ID.Info, ID.Tracks, ID.Cues, ID.SeekHead].includes(h.id) && h.size < 64 << 20) {
        const buf = await source.read(pos, h.end - pos);
        found.set(h.id, { buf, h: { ...h, dataStart: h.dataStart - pos, end: h.end - pos } });
      }
      pos = h.end;
      continue;
    }
    if (h.id === ID.SeekHead && !found.has(ID.SeekHead)) {
      found.set(h.id, { buf: head, h });
      seekMap = parseSeekHead(head, h);
    } else if ([ID.Info, ID.Tracks, ID.Cues].includes(h.id) && !found.has(h.id)) {
      found.set(h.id, { buf: head, h });
    }
    pos = h.end;
  }
  if (found.has(ID.SeekHead) && !seekMap.size) {
    const f = found.get(ID.SeekHead);
    seekMap = parseSeekHead(f.buf, f.h);
  }

  async function elementAt(offset, wantId) {
    if (offset >= source.tailStart && source.tail) {
      const h = header(source.tail, offset - source.tailStart);
      if (h && h.id === wantId && h.end > 0 && h.end <= source.tail.length) return { buf: source.tail, h };
    }
    const first = await source.read(offset, 16);
    const h = header(first, 0);
    if (!h || h.id !== wantId || h.end < 0 || h.size > 64 << 20) return null;
    const buf = await source.read(offset, h.end);
    if (buf.length < h.end) return null;
    return { buf, h };
  }

  for (const id of [ID.Info, ID.Tracks, ID.Cues]) {
    if (found.has(id) || !seekMap.has(id)) continue;
    const el = await elementAt(segData + seekMap.get(id), id);
    if (el) found.set(id, el);
  }
  // last resort for Cues: look for the element id in the cached tail
  if (!found.has(ID.Cues) && source.tail) {
    const sig = Buffer.from([0x1c, 0x53, 0xbb, 0x6b]);
    let i = source.tail.lastIndexOf(sig);
    while (i >= 0) {
      const h = header(source.tail, i);
      if (h && h.end > 0 && h.end <= source.tail.length) { found.set(ID.Cues, { buf: source.tail, h }); break; }
      i = i > 0 ? source.tail.lastIndexOf(sig, i - 1) : -1;
    }
  }

  if (!found.has(ID.Info) || !found.has(ID.Tracks)) throw new ApiError('unsupported', 'Matroska stream info not found');
  const infoEl = found.get(ID.Info);
  const info = parseInfo(infoEl.buf, infoEl.h);
  const tracksEl = found.get(ID.Tracks);
  const tracks = parseTracks(tracksEl.buf, tracksEl.h);
  const v = tracks.find((t) => t.type === 1);
  const a = tracks.find((t) => t.type === 2);
  if (!v) throw new ApiError('unsupported', 'no video track');
  if (!found.has(ID.Cues)) throw new ApiError('unsupported', 'file has no seek index (Cues)');
  const cuesEl = found.get(ID.Cues);
  const scale = info.timestampScale;
  const raw = parseCues(cuesEl.buf, cuesEl.h, v.number);
  const keyframes = [...new Set(raw)].sort((x, y) => x - y).map((t) => (t * scale) / 1e9);
  const duration = (info.duration * scale) / 1e9;
  if (!keyframes.length) throw new ApiError('unsupported', 'seek index has no video entries');
  if (!(duration > 0)) throw new ApiError('unsupported', 'file has no duration');

  return {
    duration,
    timestampScale: scale,
    keyframes,
    video: {
      codec: VIDEO_CODECS[v.codecId] || v.codecId.toLowerCase(),
      width: v.width,
      height: v.height,
      frameDuration: v.defaultDuration ? v.defaultDuration / 1e9 : 0,
    },
    audio: a ? { codec: audioCodec(a.codecId), channels: a.channels, sampleRate: a.sampleRate } : null,
  };
}
