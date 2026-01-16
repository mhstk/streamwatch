// TMDB (The Movie Database) API service for movie/TV posters
// API Documentation: https://developer.themoviedb.org/docs

import { logger } from './logger';

const TMDB_API_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';

// Log API key status on module load
logger.info('tmdb', 'Module loaded', { hasApiKey: !!TMDB_API_KEY, keyLength: TMDB_API_KEY.length });

// Image sizes available from TMDB
export const POSTER_SIZES = {
  small: 'w185',      // 185px wide - good for small cards
  medium: 'w342',     // 342px wide - good for cards
  large: 'w500',      // 500px wide - good for details
  xlarge: 'w780',     // 780px wide - good for hero/landing
  original: 'original',
} as const;

export type PosterSize = keyof typeof POSTER_SIZES;

export interface MediaInfo {
  id: number;
  title: string;
  year: number;
  type: 'movie' | 'tv';
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  rating: number;
}

export interface PosterResult {
  small: string | null;
  medium: string | null;
  large: string | null;
  xlarge: string | null;
  original: string | null;
  backdrop: string | null;
  info: MediaInfo | null;
}

interface TMDBSearchResult {
  page: number;
  results: Array<{
    id: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    media_type?: 'movie' | 'tv';
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    vote_average: number;
  }>;
  total_results: number;
}

// In-memory cache with TTL
const cache = new Map<string, { data: PosterResult; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function getCacheKey(query: string, year?: number, type?: 'movie' | 'tv'): string {
  return `${query.toLowerCase()}_${year || ''}_${type || ''}`;
}

function getFromCache(key: string): PosterResult | null {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: PosterResult): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// Build poster URL from path and size
export function getPosterUrl(posterPath: string | null, size: PosterSize = 'medium'): string | null {
  if (!posterPath) return null;
  return `${TMDB_IMAGE_BASE}/${POSTER_SIZES[size]}${posterPath}`;
}

// Build backdrop URL from path
export function getBackdropUrl(backdropPath: string | null, size: 'w780' | 'w1280' | 'original' = 'w1280'): string | null {
  if (!backdropPath) return null;
  return `${TMDB_IMAGE_BASE}/${size}${backdropPath}`;
}

// Search for a movie or TV show and get poster
export async function searchMedia(params: {
  query: string;
  year?: number;
  type?: 'movie' | 'tv';
}): Promise<PosterResult> {
  const { query, year, type } = params;

  // Check cache first
  const cacheKey = getCacheKey(query, year, type);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const emptyResult: PosterResult = {
    small: null,
    medium: null,
    large: null,
    xlarge: null,
    original: null,
    backdrop: null,
    info: null,
  };

  if (!TMDB_API_KEY || !query.trim()) {
    logger.warn('tmdb', 'searchMedia skipped - no API key or empty query', { hasKey: !!TMDB_API_KEY, query });
    return emptyResult;
  }

  logger.info('tmdb', 'searchMedia starting', { query, year, type });

  try {
    // Use multi-search if type not specified, otherwise search specific type
    const endpoint = type
      ? type === 'movie' ? '/search/movie' : '/search/tv'
      : '/search/multi';

    const searchParams = new URLSearchParams({
      api_key: TMDB_API_KEY,
      query: query.trim(),
      include_adult: 'false',
    });

    if (year) {
      if (type === 'movie') {
        searchParams.set('year', year.toString());
      } else if (type === 'tv') {
        searchParams.set('first_air_date_year', year.toString());
      }
    }

    logger.debug('tmdb', 'Fetching from TMDB', { endpoint, query: query.trim() });
    const response = await fetch(`${TMDB_API_URL}${endpoint}?${searchParams.toString()}`);

    if (!response.ok) {
      logger.error('tmdb', 'TMDB search failed', { status: response.status });
      return emptyResult;
    }

    const data: TMDBSearchResult = await response.json();
    logger.debug('tmdb', 'TMDB response', { resultCount: data.results?.length || 0 });

    if (!data.results || data.results.length === 0) {
      logger.debug('tmdb', 'No results found', { query });
      setCache(cacheKey, emptyResult);
      return emptyResult;
    }

    // Filter to only movies and TV shows if using multi-search
    const filtered = type
      ? data.results
      : data.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');

    if (filtered.length === 0) {
      setCache(cacheKey, emptyResult);
      return emptyResult;
    }

    // Use the first result
    const item = filtered[0];
    const isMovie = type === 'movie' || item.media_type === 'movie';
    const title = isMovie ? item.title || item.original_title : item.name || item.original_name;
    const releaseDate = isMovie ? item.release_date : item.first_air_date;
    const releaseYear = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : 0;

    const info: MediaInfo = {
      id: item.id,
      title: title || query,
      year: releaseYear,
      type: isMovie ? 'movie' : 'tv',
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      overview: item.overview || '',
      rating: item.vote_average || 0,
    };

    const result: PosterResult = {
      small: getPosterUrl(item.poster_path, 'small'),
      medium: getPosterUrl(item.poster_path, 'medium'),
      large: getPosterUrl(item.poster_path, 'large'),
      xlarge: getPosterUrl(item.poster_path, 'xlarge'),
      original: getPosterUrl(item.poster_path, 'original'),
      backdrop: getBackdropUrl(item.backdrop_path),
      info,
    };

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error('TMDB search error:', err);
    return emptyResult;
  }
}

// Extract title info from filename and search for poster
export async function getPosterFromFilename(filename: string): Promise<PosterResult> {
  const parsed = parseFilename(filename);
  logger.debug('tmdb', 'Parsed filename', { original: filename, parsed });

  // Try searching with year first if available
  if (parsed.year) {
    const result = await searchMedia({
      query: parsed.title,
      year: parsed.year,
      type: parsed.isSeries ? 'tv' : undefined,
    });

    if (result.info) {
      return result;
    }
  }

  // Fall back to search without year
  return searchMedia({
    query: parsed.title,
    type: parsed.isSeries ? 'tv' : undefined,
  });
}

// Parse filename to extract title, year, and detect if it's a series
function parseFilename(filename: string): {
  title: string;
  year?: number;
  isSeries: boolean;
  season?: number;
  episode?: number;
} {
  // Remove file extension
  let name = filename.replace(/\.(mp4|mkv|avi|webm|mov|m4v)$/i, '');

  // Replace common separators with spaces
  name = name.replace(/[._-]/g, ' ');

  // Detect season/episode patterns BEFORE cutting off quality info
  const seasonEpisodePatterns = [
    /[Ss](\d{1,2})[Ee](\d{1,2})/,
    /(\d{1,2})x(\d{1,2})/,
    /[Ss]eason\s*(\d{1,2})\s*[Ee]pisode\s*(\d{1,2})/i,
  ];

  let season: number | undefined;
  let episode: number | undefined;
  let isSeries = false;

  for (const pattern of seasonEpisodePatterns) {
    const match = name.match(pattern);
    if (match) {
      season = parseInt(match[1], 10);
      episode = parseInt(match[2], 10);
      isSeries = true;
      // Don't remove yet, we'll cut at quality indicator
      break;
    }
  }

  // Find where the quality/technical info starts and cut everything after
  // We need to find the EARLIEST match across all patterns
  const qualityCutoffPattern = /\s+(360p|480p|576p|720p|1080p|1440p|2160p|4k|uhd|hdtv|webrip|web rip|bluray|blu ray|brrip|br rip|web dl|webdl|hdrip|dvdrip|dvd rip|hdcam|cam|ts|telesync|screener|r5|x264|x265|h264|h265|hevc|avc|xvid|divx|10bit|hdr|hdr10|aac|ac3|dts|flac|yts|rarbg|etrg|ettv|evo|sparks|proper|repack|internal)\b/i;

  const cutoffMatch = name.match(qualityCutoffPattern);
  if (cutoffMatch && cutoffMatch.index !== undefined) {
    name = name.substring(0, cutoffMatch.index);
  }

  // Now remove the season/episode pattern from the title
  for (const pattern of seasonEpisodePatterns) {
    name = name.replace(pattern, '').trim();
  }

  // Extract year
  let year: number | undefined;
  const yearMatch = name.match(/[\s\(]*((?:19|20)\d{2})[\s\)]*/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    name = name.replace(yearMatch[0], ' ').trim();
  }

  // Clean up brackets and multiple spaces
  name = name
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: name,
    year,
    isSeries,
    season,
    episode,
  };
}

// Get movie details by ID (for more info)
export async function getMovieDetails(movieId: number): Promise<MediaInfo | null> {
  if (!TMDB_API_KEY) return null;

  try {
    const response = await fetch(
      `${TMDB_API_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    return {
      id: data.id,
      title: data.title || data.original_title,
      year: data.release_date ? parseInt(data.release_date.split('-')[0], 10) : 0,
      type: 'movie',
      posterPath: data.poster_path,
      backdropPath: data.backdrop_path,
      overview: data.overview || '',
      rating: data.vote_average || 0,
    };
  } catch {
    return null;
  }
}

// Get TV show details by ID
export async function getTVDetails(tvId: number): Promise<MediaInfo | null> {
  if (!TMDB_API_KEY) return null;

  try {
    const response = await fetch(
      `${TMDB_API_URL}/tv/${tvId}?api_key=${TMDB_API_KEY}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    return {
      id: data.id,
      title: data.name || data.original_name,
      year: data.first_air_date ? parseInt(data.first_air_date.split('-')[0], 10) : 0,
      type: 'tv',
      posterPath: data.poster_path,
      backdropPath: data.backdrop_path,
      overview: data.overview || '',
      rating: data.vote_average || 0,
    };
  } catch {
    return null;
  }
}

// Clear the cache (useful for testing or forcing refresh)
export function clearPosterCache(): void {
  cache.clear();
}
