import { VIDEO_EXTENSIONS } from './constants';
import { logger } from './logger';

/**
 * Parsed episode information
 */
export interface ParsedEpisode {
  url: string;
  title: string;
  seriesName: string;
  season?: number;
  episode: number;
  quality?: string;
  originalFilename: string;
}

/**
 * Common episode patterns:
 * - S01E01, S1E1, s01e01
 * - Episode 01, Episode_01, Ep01, Ep_01, EP01
 * - E01, E1
 * - 01, 001 (just numbers at certain positions)
 * - [01], (01)
 * - Part 1, Part_1
 * - Season 1 Episode 1
 */
const EPISODE_PATTERNS = [
  // S01E01 format (most common)
  /[Ss](\d{1,2})[Ee](\d{1,3})/,
  // Season 1 Episode 1 format
  /[Ss]eason\s*(\d{1,2})\s*[Ee]pisode\s*(\d{1,3})/i,
  // Just episode number: Episode 01, Ep01, EP_01
  /[Ee](?:pisode|p)?[\s._-]*(\d{1,3})/,
  // Bracketed numbers: [01], (01)
  /[\[\(](\d{1,3})[\]\)]/,
  // Part format: Part 1, Part_1
  /[Pp]art[\s._-]*(\d{1,3})/,
  // Dash or underscore followed by numbers: -01, _01, .01
  /[\s._-](\d{2,3})(?:[\s._-]|$)/,
];

/**
 * Quality indicators to preserve
 */
const QUALITY_PATTERNS = [
  /(\d{3,4}p)/i,           // 720p, 1080p, 2160p
  /(4K|UHD)/i,
  /(HD|SD|FHD)/i,
  /(x264|x265|HEVC|AVC)/i,
  /(BluRay|BRRip|WEBRip|HDTV|DVDRip)/i,
];

/**
 * Extract episode info from a filename/URL
 */
export function parseEpisodeInfo(url: string): ParsedEpisode | null {
  try {
    const urlObj = new URL(url);
    const pathname = decodeURIComponent(urlObj.pathname);
    const filename = pathname.split('/').pop() || '';

    // Remove extension
    let nameWithoutExt = filename;
    for (const ext of VIDEO_EXTENSIONS) {
      if (nameWithoutExt.toLowerCase().endsWith(ext)) {
        nameWithoutExt = nameWithoutExt.slice(0, -ext.length);
        break;
      }
    }

    // Extract quality
    let quality: string | undefined;
    for (const pattern of QUALITY_PATTERNS) {
      const match = nameWithoutExt.match(pattern);
      if (match) {
        quality = match[1];
        break;
      }
    }

    // Try to parse episode info
    let season: number | undefined;
    let episode: number | undefined;
    let seriesName = '';

    // Try S01E01 format first
    const seasonEpMatch = nameWithoutExt.match(/[Ss](\d{1,2})[Ee](\d{1,3})/);
    if (seasonEpMatch) {
      season = parseInt(seasonEpMatch[1], 10);
      episode = parseInt(seasonEpMatch[2], 10);
      // Series name is everything before the SxxExx
      const idx = nameWithoutExt.indexOf(seasonEpMatch[0]);
      seriesName = nameWithoutExt.substring(0, idx).trim();
    } else {
      // Try other patterns
      for (const pattern of EPISODE_PATTERNS.slice(1)) {
        const match = nameWithoutExt.match(pattern);
        if (match) {
          episode = parseInt(match[1], 10);
          // Series name is everything before the match
          const idx = nameWithoutExt.search(pattern);
          if (idx > 0) {
            seriesName = nameWithoutExt.substring(0, idx).trim();
          }
          break;
        }
      }
    }

    if (episode === undefined) {
      logger.debug('episodeParser', 'Could not parse episode number', { filename });
      return null;
    }

    // Clean up series name
    seriesName = seriesName
      .replace(/[\._-]+/g, ' ')  // Replace separators with spaces
      .replace(/\s+/g, ' ')      // Collapse multiple spaces
      .replace(/^\s+|\s+$/g, '') // Trim
      || 'Unknown Series';

    const title = `${seriesName}${season ? ` S${String(season).padStart(2, '0')}` : ''}E${String(episode).padStart(2, '0')}`;

    logger.debug('episodeParser', 'Parsed episode', {
      filename,
      seriesName,
      season,
      episode,
      quality,
      title
    });

    return {
      url,
      title,
      seriesName,
      season,
      episode,
      quality,
      originalFilename: filename,
    };
  } catch (err) {
    logger.error('episodeParser', 'Failed to parse episode', err);
    return null;
  }
}

/**
 * Generate expected filename pattern for next/previous episode
 */
export function generateEpisodePattern(
  parsed: ParsedEpisode,
  episodeOffset: number
): RegExp {
  const targetEpisode = parsed.episode + episodeOffset;

  if (targetEpisode < 1) {
    // Would need to go to previous season - return pattern that won't match
    return /^$/;
  }

  const escapedSeriesName = parsed.seriesName
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '[\\s._-]*');

  let pattern: string;

  if (parsed.season !== undefined) {
    // S01E01 format - look for same season, different episode
    const epStr1 = String(targetEpisode);
    const epStr2 = String(targetEpisode).padStart(2, '0');
    const epStr3 = String(targetEpisode).padStart(3, '0');

    pattern = `${escapedSeriesName}[\\s._-]*[Ss]0?${parsed.season}[Ee](${epStr1}|${epStr2}|${epStr3})`;
  } else {
    // Episode only format
    const epStr1 = String(targetEpisode);
    const epStr2 = String(targetEpisode).padStart(2, '0');
    const epStr3 = String(targetEpisode).padStart(3, '0');

    pattern = `${escapedSeriesName}[\\s._-]*[Ee]?(?:pisode)?[\\s._-]*(${epStr1}|${epStr2}|${epStr3})`;
  }

  return new RegExp(pattern, 'i');
}

/**
 * Find related episodes from a list of URLs
 */
export function findRelatedEpisodes(
  currentUrl: string,
  allUrls: string[],
  direction: 'next' | 'previous' | 'all' = 'all'
): ParsedEpisode[] {
  const currentParsed = parseEpisodeInfo(currentUrl);
  if (!currentParsed) {
    logger.debug('episodeParser', 'Could not parse current episode');
    return [];
  }

  logger.info('episodeParser', 'Finding related episodes', {
    seriesName: currentParsed.seriesName,
    currentEpisode: currentParsed.episode,
    direction,
    urlCount: allUrls.length,
  });

  const related: ParsedEpisode[] = [];

  // Parse all URLs and filter by series name
  for (const url of allUrls) {
    if (url === currentUrl) continue;

    const parsed = parseEpisodeInfo(url);
    if (!parsed) continue;

    // Check if same series (fuzzy match on series name)
    const currentNameNorm = currentParsed.seriesName.toLowerCase().replace(/\s+/g, '');
    const parsedNameNorm = parsed.seriesName.toLowerCase().replace(/\s+/g, '');

    // Check for similar series names (80% match or contains)
    const isSameSeries =
      currentNameNorm === parsedNameNorm ||
      currentNameNorm.includes(parsedNameNorm) ||
      parsedNameNorm.includes(currentNameNorm) ||
      levenshteinSimilarity(currentNameNorm, parsedNameNorm) > 0.8;

    if (!isSameSeries) continue;

    // Check season match if applicable
    if (currentParsed.season !== undefined && parsed.season !== undefined) {
      if (currentParsed.season !== parsed.season) continue;
    }

    // Check direction
    if (direction === 'next' && parsed.episode <= currentParsed.episode) continue;
    if (direction === 'previous' && parsed.episode >= currentParsed.episode) continue;

    // Check quality match if available
    if (currentParsed.quality && parsed.quality &&
        currentParsed.quality.toLowerCase() !== parsed.quality.toLowerCase()) {
      // Skip if quality doesn't match (prefer same quality)
      continue;
    }

    related.push(parsed);
  }

  // Sort by episode number
  related.sort((a, b) => {
    if (a.season !== b.season) {
      return (a.season || 0) - (b.season || 0);
    }
    return a.episode - b.episode;
  });

  logger.info('episodeParser', 'Found related episodes', {
    count: related.length,
    episodes: related.map(e => `S${e.season || '?'}E${e.episode}`).join(', '),
  });

  return related;
}

/**
 * Simple Levenshtein distance similarity (0-1)
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

/**
 * Check if a URL is a video file
 */
export function isVideoUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}
