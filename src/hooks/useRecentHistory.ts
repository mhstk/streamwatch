import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { getRecentHistory, clearWatchHistory } from '@/lib/firestore';
import { VideoHistory } from '@/types';
import { logger } from '@/lib/logger';

interface UseRecentHistoryReturn {
  history: VideoHistory[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearHistory: () => Promise<void>;
}

export function useRecentHistory(maxResults: number = 5): UseRecentHistoryReturn {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [history, setHistory] = useState<VideoHistory[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  logger.debug('history', 'useRecentHistory render', {
    isAuthLoading,
    hasUser: !!user,
    isHistoryLoading,
    historyCount: history.length
  });

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

  // Loading is true if auth is loading OR history is being fetched
  const isLoading = isAuthLoading || isHistoryLoading;

  return {
    history,
    isLoading,
    error,
    refresh,
    clearHistory: clearHistoryHandler,
  };
}
