/**
 * Release-name parser.
 *
 * Turns a video filename (or an already cleaned-up title) into structured
 * info: is it a series episode or a movie, what is the clean title, and a
 * stable identity key.
 *
 * The key matters because many hosts hand out a different, expiring URL for
 * the same file every time (token/IP/expiry in the path). Anything that has to
 * recognise "the same video" (progress, history, series membership) must use
 * `key`, never the raw URL.
 */

export type MediaKind = 'episode' | 'movie' | 'unknown';

export interface ParsedMedia {
  kind: MediaKind;
  /** Clean title: series name for episodes, movie name for movies */
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  quality?: string;
  /** Human readable: "Friends S05E16", "Saltburn (2023)" */
  displayTitle: string;
  /** Stable identity of this video across different URLs/qualities */
  key: string;
  /** Stable identity of the series this episode belongs to */
  seriesKey?: string;
}

export interface ParseOptions {
  /**
   * Also accept a bare trailing number as an episode number
   * ("Naruto 125 720p"). Too error-prone for automatic titles
   * ("Apollo 13"), so only used when the user is explicitly building a series.
   */
  loose?: boolean;
}

const VIDEO_EXT_RE = /\.(mp4|mkv|webm|avi|mov|m4v|flv|wmv|mpg|mpeg|3gp|ogv|ts)$/i;

// Tokens that mark the start of the technical part of a release name.
const QUALITY_RE = new RegExp(
  '(?<![a-z0-9])(?:' +
    [
      '\\d{3,4}[pi]', '4k', 'uhd', 'hdtv', 'pdtv',
      'web[ -]?dl', 'web[ -]?rip', 'webhd',
      'blu[ -]?ray', 'b[rd][ -]?rip', 'bdremux', 'remux',
      'hd[ -]?rip', 'dvd[ -]?rip', 'dvdscr', 'hd[ -]?cam', 'hdts', 'telesync',
      '[xh] ?26[45]', 'hevc', 'avc', 'xvid', 'divx',
      '(?:10|8) ?bit', 'hdr(?:10)?',
      'aac', 'e?ac3', 'ddp?\\d', 'dts', 'flac', 'atmos', '\\dch',
    ].join('|') +
    ')(?![a-z0-9])',
  'i'
);

const RESOLUTION_RE = /(?<![a-z0-9])(\d{3,4}p|4k|uhd)(?![a-z0-9])/i;

// Explicit episode markers, most specific first. Every pattern requires a
// token boundary in front, so "Dune 2021" or "No Other Choice 2025" can never
// match on the trailing "e" of a word.
const EPISODE_PATTERNS: Array<{ re: RegExp; season?: number; episode: number }> = [
  // S01E02, S01 E02, S01-E02, S1EP2
  { re: /(?<![a-z0-9])s(\d{1,2}) ?[-x]? ?e(?:p|pisode)? ?(\d{1,3})(?!\d)/i, season: 1, episode: 2 },
  // Season 1 Episode 2
  { re: /(?<![a-z0-9])season ?(\d{1,2}) ?[-,]? ?(?:episode|ep|e) ?(\d{1,3})(?!\d)/i, season: 1, episode: 2 },
  // 1x02
  { re: /(?<![a-z0-9])(\d{1,2})x(\d{2,3})(?![a-z0-9])/i, season: 1, episode: 2 },
  // Episode 5, Ep 05, EP05
  { re: /(?<![a-z0-9])(?:episode|ep) ?(\d{1,4})(?![a-z0-9])/i, episode: 1 },
  // E05 (standalone token, at least two digits)
  { re: /(?<![a-z0-9])e(\d{2,4})(?![a-z0-9])/i, episode: 1 },
];

const YEAR_RE = /(?<![a-z0-9])((?:19|20)\d{2})(?![a-z0-9])/gi;

function isPlausibleYear(year: number): boolean {
  return year >= 1900 && year <= new Date().getFullYear() + 1;
}

/** Lowercased letters+digits only, for comparing names */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Decoded last path segment of a URL */
export function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').pop() || '';
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return '';
  }
}

function cleanTitle(raw: string): string {
  let title = raw
    .replace(/[\s\-–:,]+$/g, '')
    .replace(/^[\s\-–:,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // "Sorcerer s Stone" -> "Sorcerer's Stone", "Don t Look Up" -> "Don't Look Up"
  title = title.replace(/(\p{L}) ([st])(?= |$)/gu, "$1'$2");

  // all-lowercase names read badly as titles
  if (title && title === title.toLowerCase()) {
    title = title.replace(/(^|\s)(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
  }

  return title;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatEpisodeCode(season: number | undefined, episode: number): string {
  return season !== undefined ? `S${pad2(season)}E${pad2(episode)}` : `E${pad2(episode)}`;
}

/**
 * Parse a filename or title.
 */
export function parseMediaName(input: string, options: ParseOptions = {}): ParsedMedia {
  let s = (input || '').trim();
  const rawForKey = s.replace(VIDEO_EXT_RE, '');

  s = s.replace(VIDEO_EXT_RE, '');
  // [group] tags and (non-year) parentheticals carry no title info
  s = s.replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/\((?!\s*(?:19|20)\d{2}\s*\))[^)]*\)/g, ' ');
  s = s.replace(/[()]/g, ' ');
  s = s.replace(/[._+]/g, ' ').replace(/\s+/g, ' ').trim();
  // "www.site.com - Movie Name"
  s = s.replace(/^www \S+ (?:com|net|org|ir|tv|co|me|io|in|xyz|site)\b[\s-]*/i, '');

  const qualityMatch = QUALITY_RE.exec(s);
  const qualityIdx = qualityMatch ? qualityMatch.index : s.length;
  const resolution = RESOLUTION_RE.exec(s);
  const quality = resolution ? resolution[1] : undefined;

  // --- episode marker ---
  let season: number | undefined;
  let episode: number | undefined;
  let episodeIdx = -1;

  for (const pattern of EPISODE_PATTERNS) {
    const m = pattern.re.exec(s);
    if (m) {
      season = pattern.season !== undefined ? parseInt(m[pattern.season], 10) : undefined;
      episode = parseInt(m[pattern.episode], 10);
      episodeIdx = m.index;
      break;
    }
  }

  // --- year: last plausible year before the technical part, never the first token ---
  let year: number | undefined;
  let yearIdx = -1;
  YEAR_RE.lastIndex = 0;
  let ym: RegExpExecArray | null;
  while ((ym = YEAR_RE.exec(s)) !== null) {
    const value = parseInt(ym[1], 10);
    if (ym.index === 0 || ym.index >= qualityIdx || !isPlausibleYear(value)) continue;
    // for episodes, a year after the marker belongs to the episode title
    if (episodeIdx >= 0 && ym.index > episodeIdx) continue;
    year = value;
    yearIdx = ym.index;
  }

  // --- weaker episode hints, only when nothing says "movie" ---
  if (episode === undefined && year === undefined) {
    const head = s.slice(0, qualityIdx).trim();
    // "Show Name - 05" (anime style)
    const dashed = /^(.*\p{L}.*?) - (\d{1,4})(?:v\d)?$/u.exec(head);
    // "Show Name 05" - zero padded number right before the technical part
    const padded = /^(.*\p{L}.*?) (0\d{1,2})$/u.exec(head);
    // "Show Name 125" - only on request
    const bare = options.loose ? /^(.*\p{L}.*?) (\d{2,4})$/u.exec(head) : null;
    const weak = dashed || padded || bare;
    if (weak) {
      const value = parseInt(weak[2], 10);
      if (!(weak[2].length === 4 && isPlausibleYear(value))) {
        episode = value;
        episodeIdx = weak[1].length;
      }
    }
  }

  // --- title ---
  let titleEnd = qualityIdx;
  if (episodeIdx >= 0) titleEnd = Math.min(titleEnd, episodeIdx);
  if (yearIdx >= 0) titleEnd = Math.min(titleEnd, yearIdx);
  const title = cleanTitle(s.slice(0, titleEnd));
  const norm = normalizeName(title);

  const fileKey = `file:${rawForKey.toLowerCase().replace(/\s+/g, ' ').trim()}`;

  if (episode !== undefined) {
    const code = formatEpisodeCode(season, episode);
    return {
      kind: 'episode',
      title,
      year,
      season,
      episode,
      quality,
      displayTitle: title ? `${title} ${code}` : code,
      key: norm ? `tv:${norm}:s${season ?? 0}e${episode}` : fileKey,
      seriesKey: norm ? `tv:${norm}` : undefined,
    };
  }

  if (year !== undefined && title) {
    return {
      kind: 'movie',
      title,
      year,
      quality,
      displayTitle: `${title} (${year})`,
      key: norm ? `movie:${norm}:${year}` : fileKey,
    };
  }

  const fallback = title || cleanTitle(s) || 'Unknown Video';
  return {
    kind: 'unknown',
    title: fallback,
    quality,
    displayTitle: fallback,
    key: fileKey,
  };
}

/** Parse the filename of a video URL */
export function parseMediaUrl(url: string, options: ParseOptions = {}): ParsedMedia {
  const filename = filenameFromUrl(url);
  if (!filename) {
    return { kind: 'unknown', title: 'Unknown Video', displayTitle: 'Unknown Video', key: `url:${url}` };
  }
  return parseMediaName(filename, options);
}

/** Identity key for a video URL (same file behind a new link -> same key) */
export function mediaKeyFromUrl(url: string): string {
  return parseMediaUrl(url).key;
}

/** True when two URLs point at the same video */
export function isSameMedia(urlA: string, urlB: string): boolean {
  return urlA === urlB || mediaKeyFromUrl(urlA) === mediaKeyFromUrl(urlB);
}

/** Display title for a video URL: "Friends S05E16", "Saltburn (2023)" */
export function getVideoTitle(url: string): string {
  return parseMediaUrl(url).displayTitle;
}
