import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { formatTime } from '@/lib/utils';
import { getVideoTitle, mediaKeyFromUrl, parseMediaUrl } from '@/lib/titleParser';
import { useSettings } from '@/hooks/useSettings';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { useSeries } from '@/hooks/useSeries';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';
import SeriesSidebar from './components/SeriesSidebar';
import NextEpisodeOverlay from './components/NextEpisodeOverlay';
import AddToSeriesModal from './components/AddToSeriesModal';
import SubtitleModal, { SubtitleSource } from './components/SubtitleModal';
import PlayerTopBar from './components/PlayerTopBar';
import CapsuleActions from '@/components/CapsuleActions';
import KeyboardLegend from '@/components/KeyboardLegend';
import { Episode } from '@/types';
import { fetchSubtitle, readSubtitleFile, createSubtitleBlobUrl } from '@/lib/subtitles';
import { saveSubtitlePreference, getSubtitlePreference } from '@/lib/firestore';
import { downloadSubtitle, extractSubtitleFromZip } from '@/lib/subtitleSearch';
import { Timestamp } from 'firebase/firestore';

const SPEEDS_STORAGE_KEY = 'streamwatch_speeds';

// True for elements the user types into. Sliders/checkboxes don't count, so
// keyboard shortcuts keep working after the volume slider was used.
function isTextEntry(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'file'].includes(el.type);
  }
  return el.isContentEditable;
}

// Helper to safely call play() and ignore AbortError (expected when source changes)
function safePlay(video: HTMLVideoElement | null): void {
  if (!video) return;
  video.play().catch((err) => {
    // AbortError is expected when source changes during play - ignore it
    if (err.name !== 'AbortError') {
      console.error('Video play error:', err);
    }
  });
}

export default function Player() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('StreamWatch Player');

  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [subtitles, setSubtitles] = useState<{ label: string; src: string }[]>([]);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [actionOverlay, setActionOverlay] = useState<{ type: 'play' | 'pause' | 'seekBack' | 'seekForward'; key: number } | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleOffsetIndicator, setSubtitleOffsetIndicator] = useState<{ text: string; key: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const actionKeyRef = useRef(0);
  const subtitleIndicatorKeyRef = useRef(0);
  const originalCueTimesRef = useRef<Map<number, { start: number; end: number }> | null>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const isPlayingRef = useRef(false);
  const lastEpisodeSyncRef = useRef(0);
  const handlePlayNextRef = useRef<() => void>(() => {});
  const handlePlayPreviousRef = useRef<() => void>(() => {});
  const resumedForRef = useRef<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [sourcePage, setSourcePage] = useState<string | undefined>(undefined);
  const { settings, isLoading: isSettingsLoading } = useSettings();

  // Progress tracking hook
  const {
    savedProgress,
    showResumePrompt,
    resumeTime,
    saveProgress,
    dismissResumePrompt,
  } = useVideoProgress({
    videoUrl: videoUrl || '',
    title,
    saveInterval: 5000,
    sourcePage,
  });

  // Where to send the user for a fresh link when this one has expired
  const sourcePageUrl = sourcePage || savedProgress?.sourcePage;

  // Series hook
  const {
    allSeries,
    currentSeries,
    currentEpisodeIndex,
    hasNextEpisode,
    hasPreviousEpisode,
    loadSeriesForVideo,
    playNextEpisode,
    playPreviousEpisode,
    createNewSeries,
    addToSeries,
    updateEpisode,
    removeSeries,
    refresh: refreshSeries,
  } = useSeries();

  // Auth hook for subtitle preferences
  const { user } = useAuth();

  // Load video from URL params
  useEffect(() => {
    logger.info('player', 'Player mounted');
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');

    if (url) {
      logger.info('player', 'VIDEO_LOAD', {
        url: url.substring(0, 80) + '...',
        title: getVideoTitle(url),
        host: new URL(url).hostname
      });
      setVideoUrl(url);
      setTitle(getVideoTitle(url));
      document.title = `${getVideoTitle(url)} - StreamWatch`;
    } else {
      logger.warn('player', 'NO_VIDEO_URL');
    }

    // Trigger fade-in animation
    setTimeout(() => setIsReady(true), 100);
  }, []);

  // Load series context when video URL changes
  useEffect(() => {
    if (videoUrl) {
      setVideoError(false);
      loadSeriesForVideo(videoUrl);
    }
  }, [videoUrl, loadSeriesForVideo]);

  // Show a brief fading action overlay
  const flashOverlay = useCallback((type: 'play' | 'pause' | 'seekBack' | 'seekForward') => {
    actionKeyRef.current += 1;
    setActionOverlay({ type, key: actionKeyRef.current });
    setTimeout(() => {
      setActionOverlay(prev => prev?.key === actionKeyRef.current ? null : prev);
    }, 600);
  }, []);

  // Show a brief subtitle offset indicator
  const flashSubtitleIndicator = useCallback((text: string) => {
    subtitleIndicatorKeyRef.current += 1;
    setSubtitleOffsetIndicator({ text, key: subtitleIndicatorKeyRef.current });
    setTimeout(() => {
      setSubtitleOffsetIndicator(prev => prev?.key === subtitleIndicatorKeyRef.current ? null : prev);
    }, 800);
  }, []);

  // Apply subtitle offset to active track cues
  const applySubtitleOffset = useCallback((offset: number) => {
    const video = videoRef.current;
    if (!video || activeSubtitleIndex === null) return;

    const track = video.textTracks[activeSubtitleIndex];
    if (!track || !track.cues) return;

    // Store original times on first call for this track
    if (!originalCueTimesRef.current) {
      originalCueTimesRef.current = new Map();
      for (let i = 0; i < track.cues.length; i++) {
        const cue = track.cues[i] as VTTCue;
        originalCueTimesRef.current.set(i, { start: cue.startTime, end: cue.endTime });
      }
    }

    // Apply offset from original times
    for (let i = 0; i < track.cues.length; i++) {
      const cue = track.cues[i] as VTTCue;
      const original = originalCueTimesRef.current.get(i);
      if (original) {
        cue.startTime = Math.max(0, original.start + offset);
        cue.endTime = original.end + offset;
        cue.line = -3;
      }
    }
  }, [activeSubtitleIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // A dialog is open: Escape closes it, nothing else reaches the player
      if (showSubtitleModal || showAddModal || showShortcuts) {
        if (e.key === 'Escape') {
          setShowSubtitleModal(false);
          setShowAddModal(false);
          setShowShortcuts(false);
        }
        return;
      }

      // Don't handle if typing in a text field
      if (isTextEntry(e.target)) return;
      // Leave browser/OS shortcuts (Ctrl+F, Alt+Left, ...) alone
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '?') {
        setShowShortcuts(true);
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (video.paused) {
            safePlay(video);
            flashOverlay('play');
          } else {
            video.pause();
            flashOverlay('pause');
          }
          break;

        case 'f':
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            containerRef.current?.requestFullscreen();
          }
          break;

        case 'm':
          e.preventDefault();
          video.muted = !video.muted;
          break;

        case 'arrowleft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 15);
          flashOverlay('seekBack');
          break;

        case 'arrowright':
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 15);
          flashOverlay('seekForward');
          break;

        case 'arrowup':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;

        case 'arrowdown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;

        case 'j':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 15);
          flashOverlay('seekBack');
          break;

        case 'l':
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 15);
          flashOverlay('seekForward');
          break;

        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          e.preventDefault();
          const percent = parseInt(e.key) * 10;
          video.currentTime = (percent / 100) * video.duration;
          break;

        case 'home':
          e.preventDefault();
          video.currentTime = 0;
          break;

        case 'end':
          e.preventDefault();
          video.currentTime = video.duration;
          break;

        case ',':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - (1 / 30)); // Frame back
          break;

        case '.':
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + (1 / 30)); // Frame forward
          break;

        case '<':
          e.preventDefault();
          video.playbackRate = Math.max(0.25, video.playbackRate - 0.25);
          flashSubtitleIndicator(`Speed: ${video.playbackRate}x`);
          break;

        case '>':
          e.preventDefault();
          video.playbackRate = Math.min(2, video.playbackRate + 0.25);
          flashSubtitleIndicator(`Speed: ${video.playbackRate}x`);
          break;

        case 'n':
          e.preventDefault();
          if (hasNextEpisode) handlePlayNextRef.current();
          break;

        case 'p':
          e.preventDefault();
          if (hasPreviousEpisode) handlePlayPreviousRef.current();
          break;

        case 'c':
          e.preventDefault();
          // Toggle subtitles: if active, turn off; if off, turn on first subtitle
          if (subtitles.length > 0) {
            if (activeSubtitleIndex !== null) {
              setActiveSubtitleIndex(null);
            } else {
              setActiveSubtitleIndex(0);
            }
          } else {
            // No subtitles, open the modal
            setShowSubtitleModal(true);
          }
          break;

        case 'z':
          e.preventDefault();
          if (activeSubtitleIndex !== null) {
            setSubtitleOffset(prev => {
              const newOffset = Math.round((prev - 0.5) * 10) / 10;
              applySubtitleOffset(newOffset);
              flashSubtitleIndicator(`Subtitle: ${newOffset >= 0 ? '+' : ''}${newOffset.toFixed(1)}s`);
              return newOffset;
            });
          }
          break;

        case 'x':
          e.preventDefault();
          if (activeSubtitleIndex !== null) {
            setSubtitleOffset(prev => {
              const newOffset = Math.round((prev + 0.5) * 10) / 10;
              applySubtitleOffset(newOffset);
              flashSubtitleIndicator(`Subtitle: ${newOffset >= 0 ? '+' : ''}${newOffset.toFixed(1)}s`);
              return newOffset;
            });
          }
          break;

        case 'r':
          e.preventDefault();
          if (activeSubtitleIndex !== null) {
            setSubtitleOffset(0);
            applySubtitleOffset(0);
            flashSubtitleIndicator('Subtitle: Reset');
          }
          break;
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Reset mouse tracking so first move after fullscreen toggle isn't ignored
      lastMousePosRef.current = { x: -1, y: -1 };
      // Show controls briefly and restart hide timer
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlayingRef.current) setShowControls(false);
      }, 3000);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [subtitles, activeSubtitleIndex, applySubtitleOffset, flashSubtitleIndicator, flashOverlay,
      showSubtitleModal, showAddModal, showShortcuts, hasNextEpisode, hasPreviousEpisode]);

  // Navigate to new video
  const navigateToVideo = useCallback((url: string) => {
    const nextTitle = getVideoTitle(url);
    logger.info('player', 'NAVIGATE_TO_VIDEO', { title: nextTitle });

    // Update URL and reload
    const playerUrl = `${window.location.pathname}?url=${encodeURIComponent(url)}`;
    window.history.pushState({}, '', playerUrl);

    // Update state
    setVideoUrl(url);
    setTitle(nextTitle);
    document.title = `${nextTitle} - StreamWatch`;
    setShowNextEpisode(false);
    setVideoError(false);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);

    // Load video
    if (videoRef.current) {
      videoRef.current.load();
      safePlay(videoRef.current);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      setCurrentTime(time);

      // Save progress to Firestore
      if (dur > 0) {
        saveProgress(time, dur);

        // Also update episode progress in series (only if watched > 10s).
        // timeupdate fires several times a second - write at most every 5s.
        const now = Date.now();
        const storedEpisode = currentSeries?.episodes[currentEpisodeIndex];
        // a few seconds of a finished / further-watched episode must not reset it
        const isPeek = time < 30 && !!storedEpisode &&
          (storedEpisode.completed || (storedEpisode.progress ?? 0) > time);
        if (currentSeries && time > 10 && !isPeek && now - lastEpisodeSyncRef.current >= 5000) {
          lastEpisodeSyncRef.current = now;
          const progressPercent = Math.round((time / dur) * 100);
          updateEpisode(currentSeries.id, currentEpisodeIndex, {
            duration: dur,
            progress: time,
            completed: progressPercent >= 90,
            lastWatched: Timestamp.now(),
          }, videoUrl || undefined);
        }
      }
    }
  }, [saveProgress, currentSeries, currentEpisodeIndex, updateEpisode, videoUrl]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      logger.info('player', 'VIDEO_METADATA_LOADED', {
        duration: Math.round(dur),
        durationFormatted: formatTime(dur)
      });
      setDuration(dur);
      setIsLoading(false);
      setVideoError(false);
    }
  }, []);

  // Auto-resume. The saved position comes from the network and can arrive
  // before OR after the video's metadata, so handle both orders here.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || isSettingsLoading) return;
    if (!showResumePrompt || resumeTime <= 0) return;
    if (resumedForRef.current === videoUrl) return;

    if (!settings.autoResume) {
      resumedForRef.current = videoUrl;
      dismissResumePrompt();
      return;
    }

    const seek = () => {
      if (resumedForRef.current === videoUrl) return;
      resumedForRef.current = videoUrl;
      if (video.currentTime > 30) {
        // already well into the video - don't yank the user back
        dismissResumePrompt();
        return;
      }
      logger.info('player', 'AUTO_RESUME', { resumeAt: Math.round(resumeTime) });
      video.currentTime = resumeTime;
    };

    if (video.readyState >= 1) {
      seek();
      return;
    }
    video.addEventListener('loadedmetadata', seek, { once: true });
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [videoUrl, showResumePrompt, resumeTime, settings.autoResume, isSettingsLoading, dismissResumePrompt]);

  // Default / remembered playback speed
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || isSettingsLoading) return;
    let cancelled = false;
    const apply = (rate: number) => {
      if (cancelled || !videoRef.current) return;
      const safe = rate >= 0.25 && rate <= 4 ? rate : 1;
      videoRef.current.defaultPlaybackRate = safe;
      videoRef.current.playbackRate = safe;
    };
    if (settings.rememberPlaybackSpeed) {
      const key = mediaKeyFromUrl(videoUrl);
      chrome.storage.local.get(SPEEDS_STORAGE_KEY, (result) => {
        apply(result?.[SPEEDS_STORAGE_KEY]?.[key] ?? settings.defaultPlaybackSpeed);
      });
    } else {
      apply(settings.defaultPlaybackSpeed);
    }
    return () => { cancelled = true; };
  }, [videoUrl, isSettingsLoading, settings.defaultPlaybackSpeed, settings.rememberPlaybackSpeed]);

  const handleRateChange = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || !settings.rememberPlaybackSpeed) return;
    const key = mediaKeyFromUrl(videoUrl);
    const rate = video.playbackRate;
    chrome.storage.local.get(SPEEDS_STORAGE_KEY, (result) => {
      const speeds: Record<string, number> = { ...(result?.[SPEEDS_STORAGE_KEY] || {}) };
      delete speeds[key];
      speeds[key] = rate;
      // keep the map small: drop the oldest entries
      const keys = Object.keys(speeds);
      for (const old of keys.slice(0, Math.max(0, keys.length - 200))) delete speeds[old];
      chrome.storage.local.set({ [SPEEDS_STORAGE_KEY]: speeds });
    });
  }, [videoUrl, settings.rememberPlaybackSpeed]);

  // Ask the background page where this link was opened from
  useEffect(() => {
    if (!videoUrl) return;
    setSourcePage(undefined);
    try {
      chrome.runtime.sendMessage({ type: 'GET_VIDEO_SOURCE', payload: { videoUrl } }, (res) => {
        void chrome.runtime.lastError;
        if (res?.success && typeof res.sourceUrl === 'string' && /^https?:/.test(res.sourceUrl)) {
          setSourcePage(res.sourceUrl);
        }
      });
    } catch {
      // background not reachable - not essential
    }
  }, [videoUrl]);

  const handleVideoEnded = useCallback(() => {
    logger.info('player', 'VIDEO_ENDED', { hasNextEpisode, seriesName: currentSeries?.name });

    if (currentSeries && hasNextEpisode) {
      // Mark current as completed
      updateEpisode(currentSeries.id, currentEpisodeIndex, { completed: true }, videoUrl || undefined);
      // Show next episode overlay
      setShowNextEpisode(true);
    }
  }, [currentSeries, hasNextEpisode, currentEpisodeIndex, updateEpisode]);

  const handlePlayNext = useCallback(() => {
    const nextUrl = playNextEpisode();
    if (nextUrl) navigateToVideo(nextUrl);
  }, [playNextEpisode, navigateToVideo]);


  const handlePlayPrevious = useCallback(() => {
    const prevUrl = playPreviousEpisode();
    if (prevUrl) navigateToVideo(prevUrl);
  }, [playPreviousEpisode, navigateToVideo]);

  // Latest handlers for the keyboard shortcut effect (declared above them)
  handlePlayNextRef.current = handlePlayNext;
  handlePlayPreviousRef.current = handlePlayPrevious;

  const handleReplay = useCallback(() => {
    setShowNextEpisode(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      safePlay(videoRef.current);
    }
  }, []);

  const handleEpisodeSelect = useCallback((episode: Episode) => {
    setShowSidebar(false);
    navigateToVideo(episode.url);
  }, [navigateToVideo]);

  const handleStartOver = useCallback(() => {
    logger.info('player', 'USER_START_OVER');
    dismissResumePrompt();
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      safePlay(videoRef.current);
    }
  }, [dismissResumePrompt]);

  // Auto-dismiss the resume notice
  useEffect(() => {
    if (!showResumePrompt) return;
    const timer = setTimeout(() => {
      logger.info('player', 'RESUME_PROMPT_AUTO_DISMISSED');
      dismissResumePrompt();
    }, 8000);
    return () => clearTimeout(timer);
  }, [showResumePrompt, dismissResumePrompt]);

  const handleAddToSeries = useCallback(async (seriesId: string, season?: number, episodeNumber?: number) => {
    if (videoUrl) {
      await addToSeries(seriesId, videoUrl, title, season, episodeNumber);
      await refreshSeries();
      // Reload series context
      await loadSeriesForVideo(videoUrl);
    }
  }, [videoUrl, title, addToSeries, refreshSeries, loadSeriesForVideo]);

  const handleCreateSeries = useCallback(async (name: string) => {
    return createNewSeries(name);
  }, [createNewSeries]);

  const handleAddEpisodeToSeries = useCallback(async (seriesId: string, url: string, episodeTitle: string, season?: number, episodeNumber?: number) => {
    await addToSeries(seriesId, url, episodeTitle, season, episodeNumber);
  }, [addToSeries]);

  const handleDeleteSeries = useCallback(async (seriesId: string) => {
    await removeSeries(seriesId);
    await refreshSeries();
  }, [removeSeries, refreshSeries]);

  // Subtitle handlers
  const handleAddSubtitle = useCallback(async (source: SubtitleSource) => {
    try {
      let blobUrl: string;

      if (source.type === 'search') {
        // Already a blob URL from SubtitleModal
        blobUrl = source.data as string;

        // Save preference if user is logged in
        if (user && videoUrl && source.subtitleId) {
          saveSubtitlePreference(user.uid, videoUrl, {
            subtitleId: source.subtitleId,
            language: source.language || '',
            languageName: source.languageName || '',
            release: source.release || '',
          }).catch(err => {
            logger.error('player', 'SAVE_SUBTITLE_PREF_ERROR', { error: err });
          });
        }
      } else if (source.type === 'url') {
        const content = await fetchSubtitle(source.data as string);
        blobUrl = createSubtitleBlobUrl(content);
      } else {
        const content = await readSubtitleFile(source.data as File);
        blobUrl = createSubtitleBlobUrl(content);
      }

      setSubtitles(prev => [...prev, { label: source.label, src: blobUrl }]);

      // Show the subtitle that was just added
      setActiveSubtitleIndex(subtitles.length);

      logger.info('player', 'SUBTITLE_ADDED', { label: source.label, type: source.type });
    } catch (err) {
      logger.error('player', 'SUBTITLE_ADD_ERROR', { error: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  }, [subtitles.length, user, videoUrl]);

  const handleRemoveSubtitle = useCallback((index: number) => {
    // Revoke the blob URL to free memory
    const subtitleToRemove = subtitles[index];
    if (subtitleToRemove?.src.startsWith('blob:')) {
      URL.revokeObjectURL(subtitleToRemove.src);
    }

    setSubtitles(prev => prev.filter((_, i) => i !== index));

    // Adjust active index if needed
    if (activeSubtitleIndex === index) {
      setActiveSubtitleIndex(null);
    } else if (activeSubtitleIndex !== null && activeSubtitleIndex > index) {
      setActiveSubtitleIndex(activeSubtitleIndex - 1);
    }

    logger.info('player', 'SUBTITLE_REMOVED', { index });
  }, [subtitles, activeSubtitleIndex]);

  const handleSelectSubtitle = useCallback((index: number | null) => {
    setActiveSubtitleIndex(index);
    logger.info('player', 'SUBTITLE_SELECTED', { index });
  }, []);

  // Cleanup blob URLs when component unmounts or video changes
  useEffect(() => {
    return () => {
      subtitles.forEach(sub => {
        if (sub.src.startsWith('blob:')) {
          URL.revokeObjectURL(sub.src);
        }
      });
    };
  }, []);

  // Clear subtitles when video changes
  useEffect(() => {
    if (videoUrl) {
      // Clear existing subtitles when navigating to new video
      subtitles.forEach(sub => {
        if (sub.src.startsWith('blob:')) {
          URL.revokeObjectURL(sub.src);
        }
      });
      setSubtitles([]);
      setActiveSubtitleIndex(null);
      setSubtitleOffset(0);
      originalCueTimesRef.current = null;
    }
  }, [videoUrl]);

  // Sync active subtitle with video text tracks
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;

    // Clear stored cue times when switching tracks
    originalCueTimesRef.current = null;

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      track.mode = i === activeSubtitleIndex ? 'showing' : 'hidden';
    }

    // Set cue position and apply any existing offset to newly activated track
    if (activeSubtitleIndex !== null) {
      const track = video.textTracks[activeSubtitleIndex];
      const applyCueSettings = () => {
        if (!track?.cues) return;
        // Store originals and apply offset (also sets cue.line = -3)
        applySubtitleOffset(subtitleOffset);
      };

      if (track?.cues && track.cues.length > 0) {
        applyCueSettings();
      } else if (track) {
        // Cues may not be loaded yet — wait for the load event
        const onLoad = () => {
          applyCueSettings();
          track.removeEventListener('cuechange', onLoad);
        };
        track.addEventListener('cuechange', onLoad);
        return () => track.removeEventListener('cuechange', onLoad);
      }
    }
  }, [activeSubtitleIndex, subtitles]);

  // Load saved subtitle preference when video loads
  useEffect(() => {
    if (!videoUrl || !user) return;

    const loadSavedSubtitle = async () => {
      try {
        const preference = await getSubtitlePreference(user.uid, videoUrl);
        if (!preference) {
          logger.debug('player', 'NO_SAVED_SUBTITLE_PREF');
          return;
        }

        logger.info('player', 'LOADING_SAVED_SUBTITLE', {
          subtitleId: preference.subtitleId,
          language: preference.language,
        });

        // Download and apply the saved subtitle
        const zipBlob = await downloadSubtitle(preference.subtitleId);
        const content = await extractSubtitleFromZip(zipBlob);
        const blobUrl = createSubtitleBlobUrl(content);

        setSubtitles([{ label: `${preference.languageName} - ${preference.release}`, src: blobUrl }]);
        setActiveSubtitleIndex(0);

        logger.info('player', 'SAVED_SUBTITLE_LOADED', { language: preference.languageName });
      } catch (err) {
        logger.error('player', 'LOAD_SAVED_SUBTITLE_ERROR', { error: err });
        // Don't throw - just log the error and continue without subtitle
      }
    };

    // Small delay to let video load first
    const timer = setTimeout(loadSavedSubtitle, 500);
    return () => clearTimeout(timer);
  }, [videoUrl, user]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // "Friends" + "Season 5 \u00b7 Episode 16" / "Saltburn" + "2023"
  const titleParts = useMemo(() => {
    if (!videoUrl) return { name: title, detail: '' };
    const parsed = parseMediaUrl(videoUrl);
    if (parsed.kind === 'episode' && parsed.episode !== undefined) {
      const name = currentSeries?.name || parsed.title || title;
      const detail = parsed.season !== undefined
        ? `Season ${parsed.season} \u00b7 Episode ${parsed.episode}`
        : `Episode ${parsed.episode}`;
      return { name, detail };
    }
    if (parsed.kind === 'movie') return { name: parsed.title, detail: String(parsed.year) };
    return { name: title, detail: '' };
  }, [videoUrl, title, currentSeries?.name]);

  if (!videoUrl) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-sw-dark text-white flex items-center justify-center">
        <div className={`text-center transition-all duration-500 ${isReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-sw-red/20 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-sw-accent" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <h1 className="text-3xl font-bold">
              <span className="text-sw-accent">Stream</span>Watch
            </h1>
          </div>
          <p className="text-sw-text-secondary mb-2">No video URL provided</p>
          <p className="text-sm text-sw-text-muted">
            Right-click a video link and select "Play in StreamWatch"
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`h-screen overflow-hidden bg-black text-white transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}
      onMouseUp={() => {
        // Drop focus from clicked buttons so Space/arrow keys control the video,
        // but never from a text field - that made inputs in dialogs unusable.
        const active = document.activeElement;
        if (active instanceof HTMLElement && !isTextEntry(active)) active.blur();
      }}
    >
      <PlayerTopBar sidebarOpen={showSidebar} onToggleSidebar={() => setShowSidebar(!showSidebar)} onShowShortcuts={() => setShowShortcuts(true)} hasSeries={!!user && !!currentSeries} />
      {user && <CapsuleActions sidebarOpen={showSidebar} onSubtitles={() => setShowSubtitleModal(true)} onAddToSeries={() => setShowAddModal(true)} />}
      <KeyboardLegend isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Video Player */}
      <div className="w-full h-full flex items-center justify-center bg-black relative">
        {/* Video + Custom Controls wrapper */}
        <div
          ref={containerRef}
          className={`relative group/player bg-black w-full h-full flex items-center justify-center ${isFullscreen ? 'w-screen h-screen' : ''} ${isFullscreen && !showControls && isPlaying ? 'cursor-none' : ''}`}
          onMouseMove={(e) => {
            // Ignore synthetic mousemove events (triggered by DOM changes like subtitle rendering)
            if (e.clientX === lastMousePosRef.current.x && e.clientY === lastMousePosRef.current.y) return;
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };
            setShowControls(true);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = setTimeout(() => {
              if (isPlayingRef.current) setShowControls(false);
            }, 3000);
          }}
          onMouseLeave={() => { if (isPlayingRef.current) setShowControls(false); }}
        >
          {/* Loading Overlay: opaque for the first load, just a spinner while buffering */}
          {isLoading && !videoError && (
            <div className={`absolute inset-0 flex items-center justify-center z-10 pointer-events-none animate-fade-in ${duration > 0 ? '' : 'bg-black/80'}`}>
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-sw-red/30 border-t-sw-red rounded-full animate-spin mx-auto mb-4"></div>
                {duration === 0 && <p className="text-sw-text-secondary text-sm">Loading video...</p>}
              </div>
            </div>
          )}

          {/* Playback error (usually an expired link) */}
          {videoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-20 animate-fade-in">
              <div className="text-center max-w-md px-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-sw-accent/15 flex items-center justify-center">
                  <svg className="w-7 h-7 text-sw-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <h2 className="font-heading text-xl font-semibold text-sw-text mb-2">This video can't be played</h2>
                <p className="font-body text-sm text-sw-text-secondary mb-5">
                  The link may have expired or the format isn't supported. Open the video again from the page you got it from
                  {currentTime > 0 || resumeTime > 0 ? ' \u2014 your progress is saved and it will resume where you left off.' : '.'}
                </p>
                <div className="flex items-center justify-center gap-2.5">
                  {sourcePageUrl && (
                    <a href={sourcePageUrl} target="_blank" rel="noreferrer" className="btn-primary no-underline">
                      Open source page
                    </a>
                  )}
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setVideoError(false);
                      setIsLoading(true);
                      videoRef.current?.load();
                      safePlay(videoRef.current);
                    }}
                  >
                    Try again
                  </button>
                  <a href={chrome.runtime.getURL('src/home/home.html')} className="btn-ghost no-underline">Home</a>
                </div>
              </div>
            </div>
          )}

          {/* Resume notice: small and out of the way, never dims the video */}
          {showResumePrompt && !isLoading && !showNextEpisode && !videoError && (
            <div className="absolute left-5 bottom-24 z-20 animate-slide-up">
              <div className="flex items-center gap-3 glass bg-[rgba(22,18,16,0.9)] border border-sw-border-soft rounded-[14px] pl-4 pr-2 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.5)]">
                <p className="font-body text-sm text-sw-text">
                  Resumed from <span className="text-sw-accent font-medium tabular-nums">{formatTime(resumeTime)}</span>
                </p>
                <button
                  onClick={handleStartOver}
                  className="py-1.5 px-3 bg-sw-surface text-sw-text rounded-lg font-medium text-xs hover:bg-sw-elevated active:scale-95 transition-all duration-200"
                >
                  Start over
                </button>
                <button
                  onClick={dismissResumePrompt}
                  className="text-sw-text-muted hover:text-sw-text transition-colors p-1"
                  title="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          )}

          {/* Next Episode Overlay */}
          {currentSeries && (
            <NextEpisodeOverlay
              series={currentSeries}
              currentEpisodeIndex={currentEpisodeIndex}
              isVisible={showNextEpisode}
              autoplay={settings.autoPlayNext}
              autoplayDelay={settings.autoPlayDelay}
              onPlayNext={handlePlayNext}
              onCancel={() => setShowNextEpisode(false)}
              onReplay={handleReplay}
              sidebarOpen={showSidebar}
            />
          )}
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            className={`max-w-full max-h-full ${isFullscreen ? 'w-full h-full object-contain' : ''} ${showControls || !isPlaying ? 'cursor-pointer' : 'cursor-none'}`}
            onClick={() => {
              if (clickTimeoutRef.current) { clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null; return; }
              clickTimeoutRef.current = setTimeout(() => {
                clickTimeoutRef.current = null;
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) { safePlay(v); flashOverlay('play'); } else { v.pause(); flashOverlay('pause'); }
              }, 200);
            }}
            onDoubleClick={() => {
              if (clickTimeoutRef.current) { clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null; }
              if (document.fullscreenElement) document.exitFullscreen();
              else containerRef.current?.requestFullscreen();
            }}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onCanPlay={() => setIsLoading(false)}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
            onError={() => { setIsLoading(false); setVideoError(true); }}
            onRateChange={handleRateChange}
            onEnded={handleVideoEnded}
            onPlay={() => { setIsPlaying(true); isPlayingRef.current = true; }}
            onPause={() => {
              setIsPlaying(false);
              isPlayingRef.current = false;
              // save the exact stop position right away
              lastEpisodeSyncRef.current = 0;
              handleTimeUpdate();
            }}
            onVolumeChange={() => {
              const v = videoRef.current;
              if (v) { setVolume(v.volume); setIsMuted(v.muted); }
            }}
          >
            {subtitles.map((sub, index) => (
              <track
                key={`${sub.src}-${index}`}
                kind="subtitles"
                label={sub.label}
                src={sub.src}
                default={activeSubtitleIndex === index}
              />
            ))}
            Your browser does not support the video tag.
          </video>

          {/* Title Overlay (top gradient, hidden in fullscreen) */}
          {!isFullscreen && (
            <div className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-24 pt-[72px] px-8 pointer-events-none transition-opacity duration-300 z-10 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}>
              <h1 className="font-heading text-white font-bold leading-[1.1] drop-shadow-lg truncate pb-1" style={{ fontSize: 'clamp(28px, 4vw, 56px)' }}>{titleParts.name}</h1>
              {titleParts.detail && (
                <p className="font-body text-white/75 text-lg font-medium mt-1 drop-shadow">{titleParts.detail}</p>
              )}
            </div>
          )}

          {/* Action overlay (fading play/pause/seek indicator) */}
          {actionOverlay && (
            <div key={actionOverlay.key} className="absolute inset-0 flex items-center justify-center pointer-events-none animate-action-flash">
              <div className="w-20 h-20 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
                {actionOverlay.type === 'play' && (
                  <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
                {actionOverlay.type === 'pause' && (
                  <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                )}
                {actionOverlay.type === 'seekBack' && (
                  <div className="relative flex items-center justify-center">
                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                    <span className="absolute text-white text-[10px] font-bold mt-1">15</span>
                  </div>
                )}
                {actionOverlay.type === 'seekForward' && (
                  <div className="relative flex items-center justify-center">
                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
                    <span className="absolute text-white text-[10px] font-bold mt-1">15</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Subtitle offset indicator */}
          {subtitleOffsetIndicator && (
            <div key={subtitleOffsetIndicator.key} className="absolute top-4 right-4 pointer-events-none animate-action-flash z-20">
              <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2">
                <span className="text-white text-sm font-medium">{subtitleOffsetIndicator.text}</span>
              </div>
            </div>
          )}

          {/* Custom Controls */}
          <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-3 px-4 transition-opacity duration-300 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Progress Bar */}
            <div
              ref={progressBarRef}
              className="group/prog w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 hover:h-3 transition-all"
              onClick={(e) => {
                const bar = progressBarRef.current;
                const video = videoRef.current;
                if (!bar || !video) return;
                const rect = bar.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                video.currentTime = pct * video.duration;
              }}
            >
              <div className="h-full bg-sw-red rounded-full relative" style={{ width: `${progressPercent}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-sw-red rounded-full opacity-0 group-hover/prog:opacity-100 transition-opacity shadow-md" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Play/Pause */}
              <button className="text-white hover:text-sw-accent transition-colors" onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) { safePlay(v); flashOverlay('play'); } else { v.pause(); flashOverlay('pause'); } }}>
                {isPlaying
                  ? <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  : <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                }
              </button>

              {/* Skip Back 15s */}
              <button className="text-white hover:text-sw-accent transition-colors relative" title="Back 15s" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 15); flashOverlay('seekBack'); } }}>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] text-[7px] font-bold">15</span>
              </button>

              {/* Skip Forward 15s */}
              <button className="text-white hover:text-sw-accent transition-colors relative" title="Forward 15s" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 15); flashOverlay('seekForward'); } }}>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] text-[7px] font-bold">15</span>
              </button>

              {/* Previous / Next Episode */}
              {currentSeries && (
                <>
                  <button
                    className={`transition-colors ${hasPreviousEpisode ? 'text-white hover:text-sw-accent cursor-pointer' : 'text-white/20 cursor-default'}`}
                    onClick={hasPreviousEpisode ? handlePlayPrevious : undefined}
                    title="Previous episode"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                  </button>
                  <button
                    className={`transition-colors ${hasNextEpisode ? 'text-white hover:text-sw-accent cursor-pointer' : 'text-white/20 cursor-default'}`}
                    onClick={hasNextEpisode ? handlePlayNext : undefined}
                    title="Next episode"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                  </button>
                </>
              )}

              {/* Time */}
              <span className="text-white text-sm font-mono tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>

              <div className="flex-1" />

              {/* Volume */}
              <div className="flex items-center gap-2 group/vol">
                <button className="text-white hover:text-sw-accent transition-colors" onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }}>
                  {isMuted || volume === 0
                    ? <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                    : volume < 0.5
                    ? <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072" /></svg>
                    : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728" /></svg>
                  }
                </button>
                <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                  onChange={(e) => { const val = parseFloat(e.target.value); if (videoRef.current) { videoRef.current.volume = val; videoRef.current.muted = val === 0; } }}
                  className="w-0 group-hover/vol:w-20 transition-all duration-200 accent-sw-red cursor-pointer"
                />
              </div>

              {/* Fullscreen */}
              <button className="text-white hover:text-sw-accent transition-colors" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else containerRef.current?.requestFullscreen(); }}>
                {isFullscreen
                  ? <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
                  : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Series Sidebar */}
      {currentSeries && (
        <SeriesSidebar
          series={currentSeries}
          currentEpisodeIndex={currentEpisodeIndex}
          currentVideoUrl={videoUrl || undefined}
          isOpen={showSidebar}
          onClose={() => setShowSidebar(false)}
          onEpisodeSelect={handleEpisodeSelect}
          onDeleteSeries={handleDeleteSeries}
        />
      )}

      {/* Add to Series Modal */}
      <AddToSeriesModal
        isOpen={showAddModal}
        onClose={async () => { setShowAddModal(false); await refreshSeries(); if (videoUrl) await loadSeriesForVideo(videoUrl); }}
        allSeries={allSeries}
        videoUrl={videoUrl}
        videoTitle={title}
        onAddToSeries={handleAddToSeries}
        onCreateSeries={handleCreateSeries}
        onAddEpisodeToSeries={handleAddEpisodeToSeries}
      />

      {/* Subtitle Modal */}
      <SubtitleModal
        isOpen={showSubtitleModal}
        onClose={() => setShowSubtitleModal(false)}
        onAddSubtitle={handleAddSubtitle}
        currentSubtitles={subtitles}
        onRemoveSubtitle={handleRemoveSubtitle}
        activeSubtitleIndex={activeSubtitleIndex}
        onSelectSubtitle={handleSelectSubtitle}
        videoTitle={title}
      />
    </div>
  );
}
