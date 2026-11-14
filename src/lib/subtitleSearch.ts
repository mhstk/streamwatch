// Subtitle search service using SubSource.net API
// API Documentation: https://subsource.net/api-docs

import { parseMediaName } from './titleParser';

const SUBSOURCE_API_URL = 'https://api.subsource.net/api/v1';
// SubSource API key - hardcoded for distribution
const SUBSOURCE_API_KEY = 'sk_d56fb0c0c222144040f3da203de0519af66dba8c01b7b6e801ccb8387aa51025';

export interface SubtitleSearchResult {
  id: number;
  language: string;
  languageName: string;
  release: string;
  uploadDate: string;
  downloadCount: number;
  rating: number;
  uploader: string;
  hearingImpaired: boolean;
}

export interface MovieSearchResult {
  id: number;
  title: string;
  year: number;
  type: 'movie' | 'series';
  imdbId?: string;
  season?: number;
  subtitleCount?: number;
  poster?: string;
}

export interface SearchParams {
  query?: string;
  imdbId?: string;
  year?: number;
  type?: 'movie' | 'series' | 'all';
  season?: number;
}

export interface SubtitleParams {
  movieId: number;
  language?: string;
  page?: number;
  limit?: number;
  sort?: 'newest' | 'oldest' | 'popular' | 'rating';
}

interface SubSourceMovieResponse {
  success: boolean;
  data: Array<{
    movieId: number;
    title: string;
    releaseYear: number;
    type: string;
    imdbId?: string;
    season?: number;
    subtitleCount?: number;
    posters?: {
      small?: string;
      medium?: string;
      large?: string;
      original?: string;
    };
  }>;
}

interface SubSourceSubtitleResponse {
  success: boolean;
  data: Array<{
    subtitleId: number;
    language: string;
    releaseInfo: string[];
    createdAt: string;
    downloads: number;
    rating: {
      good: number;
      bad: number;
      total: number;
    };
    contributors: Array<{
      id: number;
      displayname: string;
    }>;
    hearingImpaired: boolean;
    foreignParts: boolean;
    commentary?: string;
  }>;
  pagination?: {
    current_page: number;
    total_pages: number;
    total_items: number;
  };
}

// Language code to name mapping
const languageNames: Record<string, string> = {
  english: 'English',
  spanish: 'Spanish',
  french: 'French',
  german: 'German',
  italian: 'Italian',
  portuguese: 'Portuguese',
  russian: 'Russian',
  japanese: 'Japanese',
  korean: 'Korean',
  chinese: 'Chinese',
  arabic: 'Arabic',
  hindi: 'Hindi',
  dutch: 'Dutch',
  polish: 'Polish',
  turkish: 'Turkish',
  swedish: 'Swedish',
  danish: 'Danish',
  finnish: 'Finnish',
  norwegian: 'Norwegian',
  czech: 'Czech',
  greek: 'Greek',
  hebrew: 'Hebrew',
  hungarian: 'Hungarian',
  indonesian: 'Indonesian',
  malay: 'Malay',
  romanian: 'Romanian',
  thai: 'Thai',
  vietnamese: 'Vietnamese',
  ukrainian: 'Ukrainian',
  bulgarian: 'Bulgarian',
  croatian: 'Croatian',
  slovak: 'Slovak',
  slovenian: 'Slovenian',
  serbian: 'Serbian',
  persian: 'Persian',
  farsi_persian: 'Persian',
  brazillian_portuguese: 'Brazilian Portuguese',
};

export function getLanguageName(code: string): string {
  return languageNames[code.toLowerCase()] || code.charAt(0).toUpperCase() + code.slice(1);
}

// Common languages for the UI dropdown
export const commonLanguages = [
  { code: 'english', name: 'English' },
  { code: 'spanish', name: 'Spanish' },
  { code: 'french', name: 'French' },
  { code: 'german', name: 'German' },
  { code: 'portuguese', name: 'Portuguese' },
  { code: 'italian', name: 'Italian' },
  { code: 'russian', name: 'Russian' },
  { code: 'japanese', name: 'Japanese' },
  { code: 'korean', name: 'Korean' },
  { code: 'chinese', name: 'Chinese' },
  { code: 'arabic', name: 'Arabic' },
  { code: 'hindi', name: 'Hindi' },
  { code: 'dutch', name: 'Dutch' },
  { code: 'polish', name: 'Polish' },
  { code: 'turkish', name: 'Turkish' },
  { code: 'persian', name: 'Persian' },
  { code: 'vietnamese', name: 'Vietnamese' },
];

// Search for movies/TV shows
export async function searchMovies(params: SearchParams): Promise<MovieSearchResult[]> {
  const searchParams = new URLSearchParams();

  if (params.imdbId) {
    searchParams.set('searchType', 'imdb');
    searchParams.set('imdb', params.imdbId);
  } else if (params.query) {
    searchParams.set('searchType', 'text');
    searchParams.set('q', params.query);
  } else {
    throw new Error('Either query or imdbId is required');
  }

  if (params.year) {
    searchParams.set('year', params.year.toString());
  }
  if (params.type) {
    searchParams.set('type', params.type);
  }
  if (params.season !== undefined) {
    searchParams.set('season', params.season.toString());
  }

  const response = await fetch(`${SUBSOURCE_API_URL}/movies/search?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': SUBSOURCE_API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Movie search failed: ${response.status} - ${errorText}`);
  }

  const data: SubSourceMovieResponse = await response.json();

  if (!data.success || !data.data) {
    return [];
  }

  return data.data.map(movie => ({
    id: movie.movieId,
    title: movie.title,
    year: movie.releaseYear,
    type: movie.type === 'tvseries' ? 'series' : 'movie' as 'movie' | 'series',
    imdbId: movie.imdbId,
    season: movie.season,
    subtitleCount: movie.subtitleCount,
    poster: movie.posters?.medium,
  }));
}

// Get subtitles for a movie
export async function getSubtitles(params: SubtitleParams): Promise<{
  results: SubtitleSearchResult[];
  totalPages: number;
  currentPage: number;
}> {
  const searchParams = new URLSearchParams();

  searchParams.set('movieId', params.movieId.toString());

  if (params.language) {
    searchParams.set('language', params.language);
  }
  if (params.page) {
    searchParams.set('page', params.page.toString());
  }
  if (params.limit) {
    searchParams.set('limit', params.limit.toString());
  }
  if (params.sort) {
    searchParams.set('sort', params.sort);
  }

  const response = await fetch(`${SUBSOURCE_API_URL}/subtitles?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': SUBSOURCE_API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Subtitle search failed: ${response.status} - ${errorText}`);
  }

  const data: SubSourceSubtitleResponse = await response.json();

  if (!data.success || !data.data) {
    return { results: [], totalPages: 0, currentPage: 1 };
  }

  const results: SubtitleSearchResult[] = data.data.map(sub => ({
    id: sub.subtitleId,
    language: sub.language,
    languageName: getLanguageName(sub.language),
    release: sub.releaseInfo?.join(', ') || 'Unknown',
    uploadDate: sub.createdAt,
    downloadCount: sub.downloads || 0,
    rating: sub.rating?.total || 0,
    uploader: sub.contributors?.[0]?.displayname || 'Unknown',
    hearingImpaired: sub.hearingImpaired || false,
  }));

  return {
    results,
    totalPages: data.pagination?.total_pages || 1,
    currentPage: data.pagination?.current_page || 1,
  };
}

// Combined search - search movies then get subtitles
export async function searchSubtitles(params: {
  query: string;
  language?: string;
  season?: number;
  episode?: number;
  year?: number;
}): Promise<{
  results: SubtitleSearchResult[];
  movie?: MovieSearchResult;
}> {
  // First search for the movie/show; if the narrow search finds nothing,
  // retry without year/season before giving up.
  let movies = await searchMovies({
    query: params.query,
    season: params.season,
    year: params.season === undefined ? params.year : undefined,
  });
  if (movies.length === 0 && (params.season !== undefined || params.year !== undefined)) {
    movies = await searchMovies({ query: params.query });
  }

  if (movies.length === 0) {
    return { results: [] };
  }

  // Prefer an entry for the right season when the API returns several
  const movie =
    (params.season !== undefined && movies.find(m => m.season === params.season)) || movies[0];

  // Get subtitles for that movie
  const { results } = await getSubtitles({
    movieId: movie.id,
    language: params.language,
    limit: 50,
    sort: 'popular',
  });

  // A season lists subtitles for all its episodes: show the ones for this
  // episode first (and only those, when there are any).
  if (params.episode !== undefined) {
    const ep = params.episode;
    const episodeRe = new RegExp(`(?:^|[^a-z0-9])(?:s\\d{1,2})?[ ._-]?e(?:p|pisode)?[ ._-]?0*${ep}(?!\\d)`, 'i');
    const forEpisode = results.filter(r => episodeRe.test(r.release));
    if (forEpisode.length > 0) {
      return { results: forEpisode, movie };
    }
  }

  return { results, movie };
}

// Download subtitle - returns the download URL
export function getDownloadUrl(subtitleId: number): string {
  return `${SUBSOURCE_API_URL}/subtitles/${subtitleId}/download`;
}

// Download subtitle content
export async function downloadSubtitle(subtitleId: number): Promise<Blob> {
  const response = await fetch(getDownloadUrl(subtitleId), {
    method: 'GET',
    headers: {
      'X-API-Key': SUBSOURCE_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  return response.blob();
}

// Extract subtitle from ZIP blob
export async function extractSubtitleFromZip(zipBlob: Blob): Promise<string> {
  // Use JSZip-like approach with native APIs
  // The ZIP file contains a single subtitle file (.srt or .vtt)

  const arrayBuffer = await zipBlob.arrayBuffer();
  const dataView = new DataView(arrayBuffer);

  // Simple ZIP extraction for single file
  // ZIP local file header signature: 0x04034b50
  if (dataView.getUint32(0, true) !== 0x04034b50) {
    throw new Error('Invalid ZIP file');
  }

  // Read local file header
  const compressedSize = dataView.getUint32(18, true);
  const uncompressedSize = dataView.getUint32(22, true);
  const fileNameLength = dataView.getUint16(26, true);
  const extraFieldLength = dataView.getUint16(28, true);

  const dataStart = 30 + fileNameLength + extraFieldLength;

  // Check compression method (0 = stored, 8 = deflate)
  const compressionMethod = dataView.getUint16(8, true);

  if (compressionMethod === 0) {
    // Stored (no compression)
    const fileData = new Uint8Array(arrayBuffer, dataStart, uncompressedSize);
    return new TextDecoder('utf-8').decode(fileData);
  } else if (compressionMethod === 8) {
    // Deflate - use DecompressionStream
    const compressedData = new Uint8Array(arrayBuffer, dataStart, compressedSize);

    try {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compressedData);
      writer.close();

      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return new TextDecoder('utf-8').decode(result);
    } catch {
      throw new Error('Failed to decompress subtitle file');
    }
  } else {
    throw new Error(`Unsupported compression method: ${compressionMethod}`);
  }
}

// Format video title for the search box: "Friends S05E16", "Saltburn 2023"
export function formatSearchQuery(title: string): string {
  const parsed = parseMediaName(title);
  if (parsed.kind === 'episode') return parsed.displayTitle;
  if (parsed.kind === 'movie') return `${parsed.title} ${parsed.year}`;
  return parsed.title;
}

// Extract search terms from whatever is in the search box
export function extractSearchTerms(title: string): {
  cleanTitle: string;
  season?: number;
  episode?: number;
  year?: number;
} {
  const parsed = parseMediaName(title);
  return {
    cleanTitle: parsed.title || title.trim(),
    season: parsed.season,
    episode: parsed.episode,
    year: parsed.year,
  };
}
