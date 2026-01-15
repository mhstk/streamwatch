import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import {
  getAllSeries,
  getSeries,
  createSeries,
  addEpisodeToSeries,
  updateSeries,
  updateEpisodeInSeries,
  deleteSeries,
  findSeriesByVideoUrl,
} from '@/lib/firestore';
import { Series, Episode } from '@/types';
import { logger } from '@/lib/logger';

interface UseSeriesReturn {
  // All series
  allSeries: Series[];
  isLoading: boolean;
  error: string | null;

  // Current series context (when watching a video that's part of a series)
  currentSeries: Series | null;
  currentEpisodeIndex: number;
  hasNextEpisode: boolean;
  hasPreviousEpisode: boolean;

  // Actions
  refresh: () => Promise<void>;
  createNewSeries: (name: string, initialEpisode?: { url: string; title?: string }) => Promise<Series | null>;
  addToSeries: (seriesId: string, episodeUrl: string, episodeTitle?: string) => Promise<void>;
  updateSeriesInfo: (seriesId: string, updates: Partial<Pick<Series, 'name' | 'currentEpisodeIndex'>>) => Promise<void>;
  updateEpisode: (seriesId: string, episodeIndex: number, updates: Partial<Pick<Episode, 'duration' | 'progress' | 'completed'>>) => Promise<void>;
  removeSeries: (seriesId: string) => Promise<void>;
  loadSeriesForVideo: (videoUrl: string) => Promise<void>;
  playNextEpisode: () => string | null;
  playPreviousEpisode: () => string | null;
  clearCurrentSeries: () => void;
}

export function useSeries(): UseSeriesReturn {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current series context
  const [currentSeries, setCurrentSeries] = useState<Series | null>(null);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  logger.debug('series', 'useSeries render', {
    isAuthLoading,
    hasUser: !!user,
    seriesCount: allSeries.length,
    currentSeriesId: currentSeries?.id,
  });

  // Fetch all series
  const fetchAllSeries = useCallback(async () => {
    if (!user) {
      setAllSeries([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      logger.info('series', 'Fetching all series...', { userId: user.uid });
      const series = await getAllSeries(user.uid);
      setAllSeries(series);
      logger.info('series', 'Fetched series', { count: series.length });
    } catch (err) {
      logger.error('series', 'Failed to fetch series', err);
      setError('Failed to load series');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch series on auth change
  useEffect(() => {
    if (!isAuthLoading) {
      fetchAllSeries();
    }
  }, [isAuthLoading, fetchAllSeries]);

  // Create a new series
  const createNewSeries = useCallback(async (
    name: string,
    initialEpisode?: { url: string; title?: string }
  ): Promise<Series | null> => {
    if (!user) {
      logger.warn('series', 'Cannot create series - no user');
      return null;
    }

    try {
      setError(null);
      logger.info('series', 'Creating new series', { name, hasInitialEpisode: !!initialEpisode });
      const newSeries = await createSeries(user.uid, name, initialEpisode);
      await fetchAllSeries(); // Refresh list
      return newSeries;
    } catch (err) {
      logger.error('series', 'Failed to create series', err);
      setError('Failed to create series');
      return null;
    }
  }, [user, fetchAllSeries]);

  // Add episode to series
  const addToSeries = useCallback(async (
    seriesId: string,
    episodeUrl: string,
    episodeTitle?: string
  ): Promise<void> => {
    if (!user) {
      logger.warn('series', 'Cannot add to series - no user');
      return;
    }

    try {
      setError(null);
      logger.info('series', 'Adding episode to series', { seriesId });
      await addEpisodeToSeries(user.uid, seriesId, episodeUrl, episodeTitle);
      await fetchAllSeries(); // Refresh list

      // Update current series if it's the one we added to
      if (currentSeries?.id === seriesId) {
        const updated = await getSeries(user.uid, seriesId);
        if (updated) setCurrentSeries(updated);
      }
    } catch (err) {
      logger.error('series', 'Failed to add episode', err);
      setError('Failed to add episode');
    }
  }, [user, fetchAllSeries, currentSeries]);

  // Update series info
  const updateSeriesInfo = useCallback(async (
    seriesId: string,
    updates: Partial<Pick<Series, 'name' | 'currentEpisodeIndex'>>
  ): Promise<void> => {
    if (!user) return;

    try {
      setError(null);
      await updateSeries(user.uid, seriesId, updates);
      await fetchAllSeries();

      if (currentSeries?.id === seriesId) {
        const updated = await getSeries(user.uid, seriesId);
        if (updated) setCurrentSeries(updated);
      }
    } catch (err) {
      logger.error('series', 'Failed to update series', err);
      setError('Failed to update series');
    }
  }, [user, fetchAllSeries, currentSeries]);

  // Update episode
  const updateEpisode = useCallback(async (
    seriesId: string,
    episodeIndex: number,
    updates: Partial<Pick<Episode, 'duration' | 'progress' | 'completed'>>
  ): Promise<void> => {
    if (!user) return;

    try {
      setError(null);
      await updateEpisodeInSeries(user.uid, seriesId, episodeIndex, updates);

      // Refresh current series if applicable
      if (currentSeries?.id === seriesId) {
        const updated = await getSeries(user.uid, seriesId);
        if (updated) setCurrentSeries(updated);
      }
    } catch (err) {
      logger.error('series', 'Failed to update episode', err);
      setError('Failed to update episode');
    }
  }, [user, currentSeries]);

  // Delete series
  const removeSeries = useCallback(async (seriesId: string): Promise<void> => {
    if (!user) return;

    try {
      setError(null);
      await deleteSeries(user.uid, seriesId);
      await fetchAllSeries();

      if (currentSeries?.id === seriesId) {
        setCurrentSeries(null);
        setCurrentEpisodeIndex(0);
      }
    } catch (err) {
      logger.error('series', 'Failed to delete series', err);
      setError('Failed to delete series');
    }
  }, [user, fetchAllSeries, currentSeries]);

  // Load series context for a video URL
  const loadSeriesForVideo = useCallback(async (videoUrl: string): Promise<void> => {
    if (!user) {
      setCurrentSeries(null);
      setCurrentEpisodeIndex(0);
      return;
    }

    try {
      logger.info('series', 'Loading series for video', { url: videoUrl.substring(0, 50) + '...' });
      const result = await findSeriesByVideoUrl(user.uid, videoUrl);

      if (result) {
        setCurrentSeries(result.series);
        setCurrentEpisodeIndex(result.episodeIndex);
        logger.info('series', 'Found series for video', {
          seriesId: result.series.id,
          seriesName: result.series.name,
          episodeIndex: result.episodeIndex,
        });
      } else {
        setCurrentSeries(null);
        setCurrentEpisodeIndex(0);
        logger.debug('series', 'No series found for video');
      }
    } catch (err) {
      logger.error('series', 'Failed to load series for video', err);
      setCurrentSeries(null);
      setCurrentEpisodeIndex(0);
    }
  }, [user]);

  // Navigation helpers
  const hasNextEpisode = currentSeries
    ? currentEpisodeIndex < currentSeries.episodes.length - 1
    : false;

  const hasPreviousEpisode = currentSeries
    ? currentEpisodeIndex > 0
    : false;

  const playNextEpisode = useCallback((): string | null => {
    if (!currentSeries || !hasNextEpisode) return null;

    const nextIndex = currentEpisodeIndex + 1;
    const nextEpisode = currentSeries.episodes[nextIndex];

    if (nextEpisode) {
      logger.info('series', 'Playing next episode', {
        seriesId: currentSeries.id,
        fromIndex: currentEpisodeIndex,
        toIndex: nextIndex,
        title: nextEpisode.title,
      });
      setCurrentEpisodeIndex(nextIndex);
      return nextEpisode.url;
    }
    return null;
  }, [currentSeries, currentEpisodeIndex, hasNextEpisode]);

  const playPreviousEpisode = useCallback((): string | null => {
    if (!currentSeries || !hasPreviousEpisode) return null;

    const prevIndex = currentEpisodeIndex - 1;
    const prevEpisode = currentSeries.episodes[prevIndex];

    if (prevEpisode) {
      logger.info('series', 'Playing previous episode', {
        seriesId: currentSeries.id,
        fromIndex: currentEpisodeIndex,
        toIndex: prevIndex,
        title: prevEpisode.title,
      });
      setCurrentEpisodeIndex(prevIndex);
      return prevEpisode.url;
    }
    return null;
  }, [currentSeries, currentEpisodeIndex, hasPreviousEpisode]);

  const clearCurrentSeries = useCallback(() => {
    setCurrentSeries(null);
    setCurrentEpisodeIndex(0);
  }, []);

  return {
    allSeries,
    isLoading: isAuthLoading || isLoading,
    error,
    currentSeries,
    currentEpisodeIndex,
    hasNextEpisode,
    hasPreviousEpisode,
    refresh: fetchAllSeries,
    createNewSeries,
    addToSeries,
    updateSeriesInfo,
    updateEpisode,
    removeSeries,
    loadSeriesForVideo,
    playNextEpisode,
    playPreviousEpisode,
    clearCurrentSeries,
  };
}
