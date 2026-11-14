import { VIDEO_EXTENSIONS } from './constants';
import { logger } from './logger';
import { filenameFromUrl, normalizeName, parseMediaName } from './titleParser';

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
 * Extract episode info from a video URL.
 *
 * Returns null for anything that is not clearly an episode (movies, clips).
 * `loose` additionally accepts a bare trailing number ("Show 125 720p") and is
 * meant for flows where the user is explicitly building a series.
 */
export function parseEpisodeInfo(url: string, options: { loose?: boolean } = {}): ParsedEpisode | null {
  try {
    const filename = filenameFromUrl(url);
    if (!filename) return null;

    const parsed = parseMediaName(filename, options);
    if (parsed.kind !== 'episode' || parsed.episode === undefined) {
      logger.debug('episodeParser', 'Not an episode', { filename, kind: parsed.kind });
      return null;
    }

    return {
      url,
      title: parsed.displayTitle,
      seriesName: parsed.title || 'Unknown Series',
      season: parsed.season,
      episode: parsed.episode,
      quality: parsed.quality,
      originalFilename: filename,
    };
  } catch (err) {
    logger.error('episodeParser', 'Failed to parse episode', err);
    return null;
  }
}

/**
 * Find other episodes of the same series in a list of URLs
 */
export function findRelatedEpisodes(
  currentUrl: string,
  allUrls: string[],
  direction: 'next' | 'previous' | 'all' = 'all'
): ParsedEpisode[] {
  const currentParsed = parseEpisodeInfo(currentUrl, { loose: true });
  if (!currentParsed) {
    logger.debug('episodeParser', 'Could not parse current episode');
    return [];
  }

  const currentNameNorm = normalizeName(currentParsed.seriesName);
  const byEpisode = new Map<string, ParsedEpisode>();

  for (const url of allUrls) {
    if (url === currentUrl) continue;

    const parsed = parseEpisodeInfo(url, { loose: true });
    if (!parsed) continue;

    const parsedNameNorm = normalizeName(parsed.seriesName);
    const isSameSeries =
      currentNameNorm === parsedNameNorm ||
      (parsedNameNorm.length > 3 && currentNameNorm.includes(parsedNameNorm)) ||
      (currentNameNorm.length > 3 && parsedNameNorm.includes(currentNameNorm)) ||
      levenshteinSimilarity(currentNameNorm, parsedNameNorm) > 0.8;
    if (!isSameSeries) continue;

    // Same season only, when both are known
    if (currentParsed.season !== undefined && parsed.season !== undefined &&
        currentParsed.season !== parsed.season) continue;

    // The episode that is currently playing (possibly in another quality)
    if (parsed.episode === currentParsed.episode && parsed.season === currentParsed.season) continue;

    if (direction === 'next' && parsed.episode <= currentParsed.episode) continue;
    if (direction === 'previous' && parsed.episode >= currentParsed.episode) continue;

    // One entry per episode: prefer the same quality as the current video
    const slot = `${parsed.season ?? 0}:${parsed.episode}`;
    const existing = byEpisode.get(slot);
    const sameQuality = (p: ParsedEpisode) =>
      !currentParsed.quality || !p.quality ||
      p.quality.toLowerCase() === currentParsed.quality.toLowerCase();
    if (!existing || (!sameQuality(existing) && sameQuality(parsed))) {
      byEpisode.set(slot, parsed);
    }
  }

  const related = Array.from(byEpisode.values()).sort((a, b) => {
    if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
    return a.episode - b.episode;
  });

  logger.info('episodeParser', 'Found related episodes', {
    series: currentParsed.seriesName,
    count: related.length,
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
