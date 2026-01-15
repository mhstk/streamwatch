import { VIDEO_EXTENSIONS } from './constants';

/**
 * Check if a URL points to a video file based on extension
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

/**
 * Extract filename from URL
 */
export function extractFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || '';
    return decodeURIComponent(filename);
  } catch {
    return '';
  }
}

/**
 * Extract human-readable title from URL
 * Removes extension and replaces separators with spaces
 */
export function extractTitleFromUrl(url: string): string {
  try {
    const filename = extractFilename(url);
    if (!filename) return 'Unknown Video';

    // Remove extension
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

    // Replace common separators with spaces
    const title = nameWithoutExt
      .replace(/[_\-\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return title || 'Unknown Video';
  } catch {
    return 'Unknown Video';
  }
}

/**
 * Extract host domain from URL
 */
export function extractHost(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return 'Unknown';
  }
}

/**
 * Generate a consistent hash ID from a URL
 * Uses SHA-256 and returns first 16 characters
 */
export async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * Format seconds into MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Generate a unique ID for series
 */
export function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Calculate progress percentage
 */
export function calculateProgressPercent(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

/**
 * Build player URL with parameters
 */
export function buildPlayerUrl(
  videoUrl: string,
  options?: { seriesId?: string; episodeIndex?: number }
): string {
  const base = chrome.runtime.getURL('index.html');
  const params = new URLSearchParams({ url: videoUrl });

  if (options?.seriesId) {
    params.set('series', options.seriesId);
  }
  if (options?.episodeIndex !== undefined) {
    params.set('episode', options.episodeIndex.toString());
  }

  return `${base}?${params.toString()}`;
}

/**
 * Parse player URL parameters
 */
export function parsePlayerUrl(url: string): {
  videoUrl: string | null;
  seriesId: string | null;
  episodeIndex: number | null;
} {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    return {
      videoUrl: params.get('url'),
      seriesId: params.get('series'),
      episodeIndex: params.has('episode') ? parseInt(params.get('episode')!, 10) : null,
    };
  } catch {
    return { videoUrl: null, seriesId: null, episodeIndex: null };
  }
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
