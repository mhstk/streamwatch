import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { saveVideoProgress, getVideoProgress } from '@/lib/firestore';
import { VideoHistory } from '@/types';
import { logger } from '@/lib/logger';

interface UseVideoProgressOptions {
  videoUrl: string;
  title: string;
  saveInterval?: number; // in milliseconds
  sourcePage?: string;   // page the video link was opened from
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
  sourcePage,
}: UseVideoProgressOptions): UseVideoProgressReturn {
  const { user } = useAuth();
  const [savedProgress, setSavedProgress] = useState<VideoHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeTime, setResumeTime] = useState(0);

  const savedProgressRef = useRef<VideoHistory | null>(null);
  savedProgressRef.current = savedProgress;
  // "<uid>|<url>" once the saved position for this video has been looked up
  const loadedForRef = useRef<string | null>(null);
  const lastSaveRef = useRef<number>(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved progress whenever the video (or the signed-in user) changes
  useEffect(() => {
    let cancelled = false;
    // never carry a resume position over from the previous video
    setShowResumePrompt(false);
    setResumeTime(0);
    setSavedProgress(null);
    loadedForRef.current = null;
    setIsLoading(true);

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
        if (cancelled) return;
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
        if (!cancelled) {
          loadedForRef.current = `${user.uid}|${videoUrl}`;
          setIsLoading(false);
        }
      }
    }

    loadProgress();
    return () => { cancelled = true; };
  }, [user, videoUrl]);

  // Save progress function
  const saveProgress = useCallback(
    async (currentTime: number, duration: number) => {
      if (!user || !videoUrl || duration <= 0) return;

      // Don't write anything until we know what was saved before: the video
      // usually starts playing first, and an early "0:00" save would
      // overwrite the position we are about to resume from.
      if (loadedForRef.current !== `${user.uid}|${videoUrl}`) return;

      // Opening a video you were further into (or had finished) and watching
      // only a few seconds must not wipe the saved position.
      const saved = savedProgressRef.current;
      if (saved && currentTime < 30 && saved.progress > currentTime) return;

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
        await saveVideoProgress(user.uid, videoUrl, currentTime, duration, title, { sourcePage });
      } catch (error) {
        logger.error('hook', 'SAVE_PROGRESS_ERROR', error);
      }
    },
    [user, videoUrl, title, saveInterval, sourcePage]
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
