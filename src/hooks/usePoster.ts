import { useState, useEffect } from 'react';
import { getPosterFromFilename, PosterResult, MediaInfo } from '@/lib/tmdb';

interface UsePosterResult {
  poster: string | null;
  backdrop: string | null;
  info: MediaInfo | null;
  isLoading: boolean;
}

// Cache for poster results to avoid redundant API calls
const posterCache = new Map<string, PosterResult>();

export function usePoster(title: string): UsePosterResult {
  const [result, setResult] = useState<UsePosterResult>({
    poster: null,
    backdrop: null,
    info: null,
    isLoading: true,
  });

  useEffect(() => {
    if (!title) {
      setResult({ poster: null, backdrop: null, info: null, isLoading: false });
      return;
    }

    // Check cache first
    const cached = posterCache.get(title);
    if (cached) {
      setResult({
        poster: cached.medium,
        backdrop: cached.backdrop,
        info: cached.info,
        isLoading: false,
      });
      return;
    }

    let cancelled = false;

    const fetchPoster = async () => {
      try {
        const posterResult = await getPosterFromFilename(title);

        if (!cancelled) {
          // Cache the result
          posterCache.set(title, posterResult);

          setResult({
            poster: posterResult.medium,
            backdrop: posterResult.backdrop,
            info: posterResult.info,
            isLoading: false,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setResult({
            poster: null,
            backdrop: null,
            info: null,
            isLoading: false,
          });
        }
      }
    };

    fetchPoster();

    return () => {
      cancelled = true;
    };
  }, [title]);

  return result;
}

// Hook to fetch multiple posters at once (for rows)
export function usePosters(titles: string[]): Map<string, PosterResult> {
  const [results, setResults] = useState<Map<string, PosterResult>>(new Map());

  useEffect(() => {
    if (titles.length === 0) return;

    let cancelled = false;

    const fetchAll = async () => {
      const newResults = new Map<string, PosterResult>();

      // Fetch posters for titles not in cache
      const promises = titles.map(async (title) => {
        // Check cache first
        const cached = posterCache.get(title);
        if (cached) {
          newResults.set(title, cached);
          return;
        }

        try {
          const result = await getPosterFromFilename(title);
          posterCache.set(title, result);
          newResults.set(title, result);
        } catch {
          // Ignore errors for individual fetches
        }
      });

      await Promise.all(promises);

      if (!cancelled) {
        setResults(newResults);
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [titles.join(',')]);

  return results;
}

// Clear the poster cache
export function clearPosterCache(): void {
  posterCache.clear();
}
