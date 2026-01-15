import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { saveVideoProgress, getVideoProgress } from '@/lib/firestore';
import { VideoHistory } from '@/types';
import { logger } from '@/lib/logger';

interface UseVideoProgressOptions {
  videoUrl: string;
  title: string;
  saveInterval?: number; // in milliseconds
}

interface UseVideoProgressReturn {
  savedProgress: VideoHistory | null;
  isLoading: boolean;
  showResumePrompt: boolean;
  resumeTime: number;
  saveProgress: (currentTime: number, duration: number) => Promise<void>;
  dismissResumePrompt: () => void;
  acceptResume: () => number;
}

export function useVideoProgress({
  videoUrl,
  title,
  saveInterval = 5000,
}: UseVideoProgressOptions): UseVideoProgressReturn {
  const { user } = useAuth();
  const [savedProgress, setSavedProgress] = useState<VideoHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeTime, setResumeTime] = useState(0);

  const lastSaveRef = useRef<number>(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved progress on mount
  useEffect(() => {
    async function loadProgress() {
      logger.debug('hook', 'useVideoProgress loadProgress', {
        hasUser: !!user,
        hasUrl: !!videoUrl
      });

      if (!user || !videoUrl) {
        logger.debug('hook', 'Skipping progress load - no user or URL');
        setIsLoading(false);
        return;
      }

      try {
        logger.info('hook', 'LOADING_SAVED_PROGRESS', { userId: user.uid });
        const progress = await getVideoProgress(user.uid, videoUrl);
        setSavedProgress(progress);

        // Show resume prompt if there's saved progress > 10 seconds and < 95% complete
        if (progress && progress.progress > 10 && progress.progressPercent < 95) {
          logger.info('hook', 'RESUME_PROMPT_SHOWN', {
            savedProgress: Math.round(progress.progress),
            percent: progress.progressPercent
          });
          setResumeTime(progress.progress);
          setShowResumePrompt(true);
        } else if (progress) {
          logger.debug('hook', 'No resume prompt - completed or too short', {
            progress: progress.progress,
            percent: progress.progressPercent
          });
        }
      } catch (error) {
        logger.error('hook', 'LOAD_PROGRESS_ERROR', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadProgress();
  }, [user, videoUrl]);

  // Save progress function
  const saveProgress = useCallback(
    async (currentTime: number, duration: number) => {
      if (!user || !videoUrl || duration <= 0) return;

      const now = Date.now();

      // Throttle saves to saveInterval
      if (now - lastSaveRef.current < saveInterval) {
        // Schedule a save if one isn't pending
        if (!saveTimeoutRef.current) {
          saveTimeoutRef.current = setTimeout(() => {
            saveProgress(currentTime, duration);
            saveTimeoutRef.current = null;
          }, saveInterval - (now - lastSaveRef.current));
        }
        return;
      }

      lastSaveRef.current = now;

      try {
        logger.debug('hook', 'SAVING_PROGRESS', {
          currentTime: Math.round(currentTime),
          duration: Math.round(duration),
          percent: Math.round((currentTime / duration) * 100)
        });
        await saveVideoProgress(user.uid, videoUrl, currentTime, duration, title);
      } catch (error) {
        logger.error('hook', 'SAVE_PROGRESS_ERROR', error);
      }
    },
    [user, videoUrl, title, saveInterval]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const dismissResumePrompt = useCallback(() => {
    logger.info('hook', 'RESUME_PROMPT_DISMISSED');
    setShowResumePrompt(false);
  }, []);

  const acceptResume = useCallback(() => {
    logger.info('hook', 'RESUME_ACCEPTED', { resumeTime: Math.round(resumeTime) });
    setShowResumePrompt(false);
    return resumeTime;
  }, [resumeTime]);

  return {
    savedProgress,
    isLoading,
    showResumePrompt,
    resumeTime,
    saveProgress,
    dismissResumePrompt,
    acceptResume,
  };
}
