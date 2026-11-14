import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { getRecentHistory, clearWatchHistory, deleteHistoryEntries } from '@/lib/firestore';
import { mediaKeyFromUrl } from '@/lib/titleParser';
import { VideoHistory } from '@/types';
import { logger } from '@/lib/logger';

interface UseRecentHistoryReturn {
  history: VideoHistory[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearHistory: () => Promise<void>;
  deleteVideo: (videoUrl: string) => Promise<void>;
}

export function useRecentHistory(maxResults: number = 5): UseRecentHistoryReturn {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [history, setHistory] = useState<VideoHistory[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    logger.info('history', 'fetchHistory called', { hasUser: !!user, uid: user?.uid });

    if (!user) {
      logger.debug('history', 'No user, clearing history');
      setHistory([]);
      return;
    }

    try {
      setIsHistoryLoading(true);
      setError(null);
      logger.debug('history', 'Fetching from Firestore...');
      const recentHistory = await getRecentHistory(user.uid, maxResults);
      logger.info('history', 'Fetched history', { count: recentHistory.length });
      setHistory(recentHistory);
    } catch (err) {
      logger.error('history', 'Failed to fetch history', err);
      setError('Failed to load watch history');
    } finally {
      setIsHistoryLoading(false);
    }
  }, [user, maxResults]);

  // Fetch history when user changes (and auth is done loading)
  useEffect(() => {
    if (!isAuthLoading) {
      logger.debug('history', 'Auth done, triggering fetch');
      fetchHistory();
    }
  }, [isAuthLoading, fetchHistory]);

  const refresh = useCallback(async () => {
    logger.debug('history', 'Manual refresh triggered');
    await fetchHistory();
  }, [fetchHistory]);

  const clearHistoryHandler = useCallback(async () => {
    if (!user) return;

    try {
      setIsHistoryLoading(true);
      logger.info('history', 'Clearing history...');
      await clearWatchHistory(user.uid);
      setHistory([]);
      logger.info('history', 'History cleared');
    } catch (err) {
      logger.error('history', 'Failed to clear history', err);
      setError('Failed to clear watch history');
    } finally {
      setIsHistoryLoading(false);
    }
  }, [user]);

  const deleteVideoHandler = useCallback(async (videoUrl: string) => {
    if (!user) return;

    try {
      logger.info('history', 'Deleting video from history...', { url: videoUrl.substring(0, 50) });
      // The same video can be stored under several (older) links - remove all of them
      const key = mediaKeyFromUrl(videoUrl);
      const matches = history.filter(v => v.url === videoUrl || mediaKeyFromUrl(v.url) === key);
      await deleteHistoryEntries(user.uid, matches.map(v => v.id));
      const removed = new Set(matches.map(v => v.id));
      setHistory(prev => prev.filter(v => !removed.has(v.id)));
      logger.info('history', 'Video deleted from history');
    } catch (err) {
      logger.error('history', 'Failed to delete video', err);
      setError('Failed to delete video from history');
    }
  }, [user, history]);

  // Loading is true if auth is loading OR history is being fetched
  const isLoading = isAuthLoading || isHistoryLoading;

  return {
    history,
    isLoading,
    error,
    refresh,
    clearHistory: clearHistoryHandler,
    deleteVideo: deleteVideoHandler,
  };
}
