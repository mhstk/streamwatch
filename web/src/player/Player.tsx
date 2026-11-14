// The web player. Logic mirrors the extension's src/player/Player.tsx (progress, series,
// subtitles, resume, speed memory, keyboard), importing the shared hooks/libs so saved data
// behaves identically. The UI adapts to three layouts (see useLayout.ts).
// Mounted with key={videoUrl} by PlayerPage, so another episode is a fresh mount.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { Timestamp } from 'firebase/firestore';
import { formatTime } from '@/lib/utils';
import { filenameFromUrl, getVideoTitle, mediaKeyFromUrl, parseMediaUrl } from '@/lib/titleParser';
import { useSettings } from '@/hooks/useSettings';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { useSeries } from '@/hooks/useSeries';
import { usePoster } from '@/hooks/usePoster';
import { useAuth } from '@/hooks/useAuth';
import { fetchSubtitle, readSubtitleFile, createSubtitleBlobUrl } from '@/lib/subtitles';
import { saveSubtitlePreference, getSubtitlePreference, saveVideoProgress } from '@/lib/firestore';
import { downloadSubtitle, extractSubtitleFromZip } from '@/lib/subtitleSearch';
import type { Episode } from '@/types';
import CapsuleActions from '@/components/CapsuleActions';
import KeyboardLegend from '@/components/KeyboardLegend';
import SeriesSidebar from '@/player/components/SeriesSidebar';
import NextEpisodeOverlay from '@/player/components/NextEpisodeOverlay';
import { navigate, playerPath } from '~/router';
import { isTouch } from '~/platform/env';
import type { StreamErrorCode } from '~/platform/stream';
import { usePlayerLayout } from './useLayout';
import { useMediaSource } from './useMediaSource';
import Dialog, { sheetEntryOnTop } from './Dialog';
import TopBar from './TopBar';
import TouchCapsule from './TouchCapsule';
import TouchControls from './TouchControls';
import DesktopControls from './DesktopControls';
import EpisodeList from './EpisodeList';
import SubtitleModal, { type SubtitleSource } from './SubtitleModal';
import AddToSeriesModal from './AddToSeriesModal';
import SpeedSheet from './SpeedSheet';
import { ActionFlash, ErrorScreen, NextEpisodeCompact, ResumeNotice, TapToPlay, type Flash, type FlashType } from './Overlays';

const SPEEDS_STORAGE_KEY = 'streamwatch_speeds';
const isIPhone = /iPhone|iPod/.test(navigator.userAgent);

// True for elements the user types into (sliders/checkboxes don't count).
function isTextEntry(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'file'].includes(el.type);
  }
  return el.isContentEditable;
}

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
const fullscreenElement = () => document.fullscreenElement || (document as FsDocument).webkitFullscreenElement || null;

interface PlayerProps {
  videoUrl: string;
  /** ?stream=1: always use the streaming server (testing) */
  forceStream: boolean;
}

export default function Player({ videoUrl, forceStream }: PlayerProps) {
  const layout = usePlayerLayout();
  const desktop = layout === 'desktop';
  const portrait = layout === 'portrait';
  const landscape = layout === 'landscape';
  const title = useMemo(() => getVideoTitle(videoUrl), [videoUrl]);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [showSpeedSheet, setShowSpeedSheet] = useState(false);
  const [showEpisodesSheet, setShowEpisodesSheet] = useState(false);
  const [subtitles, setSubtitles] = useState<{ label: string; src: string }[]>([]);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [actionOverlay, setActionOverlay] = useState<Flash | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleOffsetIndicator, setSubtitleOffsetIndicator] = useState<{ text: string; key: number } | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const episodesRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ t: number; side: 'left' | 'center' | 'right' } | null>(null);
  const interactingRef = useRef(false);
  const actionKeyRef = useRef(0);
  const subtitleIndicatorKeyRef = useRef(0);
  const subtitleOffsetRef = useRef(0);
  const originalCueTimesRef = useRef<Map<number, { start: number; end: number }> | null>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const isPlayingRef = useRef(false);
  const hasPlayedRef = useRef(false);
  const autoplayTriedRef = useRef(false);
  const lastEpisodeSyncRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastDurRef = useRef(0);
  const lastPositionStateRef = useRef(0);
  const handlePlayNextRef = useRef<() => void>(() => {});
  const handlePlayPreviousRef = useRef<() => void>(() => {});
  const flushRef = useRef<() => void>(() => {});
  const resumedForRef = useRef<string | null>(null);

  const { settings, isLoading: isSettingsLoading } = useSettings();
  const { user, isLoading: isAuthLoading, signIn } = useAuth();

  const {
    savedProgress,
    isLoading: isProgressLoading,
    showResumePrompt,
    resumeTime,
    saveProgress,
    dismissResumePrompt,
  } = useVideoProgress({ videoUrl, title, saveInterval: 5000 });

  const savedProgressRef = useRef(savedProgress);
  savedProgressRef.current = savedProgress;

  // The web has no background page: the source page comes only from the saved record
  const sourcePageUrl = savedProgress?.sourcePage;

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

  // ---------- has the saved position been looked up (for the user we have now)? ----------
  const [progressKnown, setProgressKnown] = useState(false);
  const sawLoadingRef = useRef(false);
  const lastUserRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (progressKnown) return;
    if (lastUserRef.current !== user) {
      lastUserRef.current = user;
      sawLoadingRef.current = false;
    }
    if (isProgressLoading) sawLoadingRef.current = true;
    else if (!isAuthLoading && (!user || sawLoadingRef.current)) setProgressKnown(true);
  }, [isProgressLoading, isAuthLoading, user, progressKnown]);
  useEffect(() => {
    // never block playback on a slow network
    const t = setTimeout(() => setProgressKnown(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const source = useMediaSource({
    videoUrl,
    videoRef,
    forceStream,
    startReady: progressKnown && !isSettingsLoading,
    startAt: settings.autoResume && showResumePrompt ? resumeTime : 0,
  });

  // ---------- page setup ----------
  useEffect(() => {
    document.title = `${title} - StreamWatch`;
    const t = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(t);
  }, [title]);

  useEffect(() => {
    loadSeriesForVideo(videoUrl);
  }, [videoUrl, loadSeriesForVideo]);

  // ---------- playing (with "Tap to play" when the browser refuses) ----------
  const tryPlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (!p) return;
    p.then(() => setNeedsTap(false)).catch((err: DOMException) => {
      if (err?.name === 'NotAllowedError') setNeedsTap(true);
      else if (err?.name !== 'AbortError') console.error('Video play error:', err);
    });
  }, []);

  // start as soon as there is a source (iOS loads nothing before play())
  useEffect(() => {
    autoplayTriedRef.current = false;
    if (!source.src) return;
    autoplayTriedRef.current = true;
    tryPlay();
  }, [source.src, tryPlay]);

  const togglePlay = useCallback((withFlash = true) => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      tryPlay();
      if (withFlash) flashOverlay('play');
    } else {
      v.pause();
      if (withFlash) flashOverlay('pause');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryPlay]);

  // ---------- flashes ----------
  const flashOverlay = useCallback((type: FlashType, side: Flash['side'] = 'center', seconds = 15) => {
    actionKeyRef.current += 1;
    const key = actionKeyRef.current;
    setActionOverlay({ type, key, side, seconds });
    setTimeout(() => setActionOverlay((prev) => (prev?.key === key ? null : prev)), 600);
  }, []);

  const flashSubtitleIndicator = useCallback((text: string) => {
    subtitleIndicatorKeyRef.current += 1;
    const key = subtitleIndicatorKeyRef.current;
    setSubtitleOffsetIndicator({ text, key });
    setTimeout(() => setSubtitleOffsetIndicator((prev) => (prev?.key === key ? null : prev)), 800);
  }, []);

  const seekBy = useCallback((seconds: number, side: Flash['side'] = 'center') => {
    const v = videoRef.current;
    if (!v) return;
    const target = v.currentTime + seconds;
    v.currentTime = seconds < 0 ? Math.max(0, target) : Math.min(v.duration || target, target);
    flashOverlay(seconds < 0 ? 'seekBack' : 'seekForward', side, Math.abs(seconds));
  }, [flashOverlay]);

  // ---------- controls visibility ----------
  const pokeControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current && !interactingRef.current) setShowControls(false);
    }, 3000);
  }, []);

  const controlsVisible = showControls || !isPlaying;

  const setInteracting = useCallback((active: boolean) => {
    interactingRef.current = active;
    if (!active) pokeControls();
    else setShowControls(true);
  }, [pokeControls]);

  useEffect(() => () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
  }, []);

  // Touch: single tap toggles the controls, double tap on the left / right third seeks
  const handleGestureTap = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
    const side = x < 1 / 3 ? 'left' : x > 2 / 3 ? 'right' : 'center';
    const now = performance.now();
    const last = lastTapRef.current;
    lastTapRef.current = { t: now, side };

    if (side !== 'center' && last && last.side === side && now - last.t < 320) {
      if (tapTimeoutRef.current) { clearTimeout(tapTimeoutRef.current); tapTimeoutRef.current = null; }
      seekBy(side === 'left' ? -10 : 10, side);
      return;
    }

    const toggle = () => {
      if (isPlayingRef.current && showControlsRef.current) {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        setShowControls(false);
      } else {
        pokeControls();
      }
    };
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    if (side === 'center') {
      tapTimeoutRef.current = null;
      toggle();
    } else {
      tapTimeoutRef.current = setTimeout(() => { tapTimeoutRef.current = null; toggle(); }, 300);
    }
  }, [seekBy, pokeControls]);
  const showControlsRef = useRef(showControls);
  showControlsRef.current = showControls;

  // ---------- fullscreen ----------
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (fullscreenElement()) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else (document as FsDocument).webkitExitFullscreen?.();
      } catch { /* ignore */ }
      try { (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.(); } catch { /* ignore */ }
      return;
    }
    const request = container?.requestFullscreen || container?.webkitRequestFullscreen;
    if (container && request && !isIPhone) {
      try {
        await request.call(container);
      } catch {
        if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
        return;
      }
      if (!desktop) {
        try {
          await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape');
        } catch { /* not supported / not allowed */ }
      }
    } else if (video?.webkitEnterFullscreen) {
      // iPhone: only the native player can go fullscreen; subtitles are real text tracks, so they show there
      video.webkitEnterFullscreen();
    }
  }, [desktop]);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!fullscreenElement());
      lastMousePosRef.current = { x: -1, y: -1 };
      pokeControls();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [pokeControls]);

  // ---------- subtitles: offset ----------
  const applySubtitleOffset = useCallback((offset: number) => {
    const video = videoRef.current;
    if (!video || activeSubtitleIndex === null) return;
    const track = video.textTracks[activeSubtitleIndex];
    if (!track || !track.cues) return;
    if (!originalCueTimesRef.current) {
      originalCueTimesRef.current = new Map();
      for (let i = 0; i < track.cues.length; i++) {
        const cue = track.cues[i] as VTTCue;
        originalCueTimesRef.current.set(i, { start: cue.startTime, end: cue.endTime });
      }
    }
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

  const shiftSubtitles = useCallback((delta: number | 'reset') => {
    if (activeSubtitleIndex === null) return;
    const next = delta === 'reset' ? 0 : Math.round((subtitleOffsetRef.current + delta) * 10) / 10;
    subtitleOffsetRef.current = next;
    setSubtitleOffset(next);
    applySubtitleOffset(next);
    flashSubtitleIndicator(delta === 'reset' ? 'Subtitle: Reset' : `Subtitle: ${next >= 0 ? '+' : ''}${next.toFixed(1)}s`);
  }, [activeSubtitleIndex, applySubtitleOffset, flashSubtitleIndicator]);

  // ---------- keyboard (same shortcuts as the extension) ----------
  const anyDialogOpen = showSubtitleModal || showAddModal || showShortcuts || showSpeedSheet || showEpisodesSheet;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (anyDialogOpen) {
        if (e.key === 'Escape') {
          setShowSubtitleModal(false);
          setShowAddModal(false);
          setShowShortcuts(false);
          setShowSpeedSheet(false);
          setShowEpisodesSheet(false);
        }
        return;
      }
      if (isTextEntry(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '?') {
        if (!isTouch) setShowShortcuts(true);
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          video.muted = !video.muted;
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          seekBy(-15);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          seekBy(15);
          break;
        case 'arrowup':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case 'arrowdown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
          e.preventDefault();
          if (video.duration > 0) video.currentTime = (parseInt(e.key) * 10 / 100) * video.duration;
          break;
        case 'home':
          e.preventDefault();
          video.currentTime = 0;
          break;
        case 'end':
          e.preventDefault();
          if (video.duration > 0) video.currentTime = video.duration;
          break;
        case ',':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 1 / 30);
          break;
        case '.':
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
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
          if (subtitles.length > 0) setActiveSubtitleIndex(activeSubtitleIndex !== null ? null : 0);
          else setShowSubtitleModal(true);
          break;
        case 'z':
          e.preventDefault();
          shiftSubtitles(-0.5);
          break;
        case 'x':
          e.preventDefault();
          shiftSubtitles(0.5);
          break;
        case 'r':
          e.preventDefault();
          shiftSubtitles('reset');
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [anyDialogOpen, subtitles, activeSubtitleIndex, shiftSubtitles, flashSubtitleIndicator, togglePlay,
      toggleFullscreen, seekBy, hasNextEpisode, hasPreviousEpisode]);

  // ---------- navigation ----------
  const goToVideo = useCallback((url: string) => {
    // a sheet's history entry on top is replaced, so Back returns to this episode
    navigate(playerPath(url) + (forceStream ? '&stream=1' : ''), { replace: sheetEntryOnTop() });
  }, [forceStream]);

  const goHome = useCallback(() => navigate('/'), []);

  // ---------- progress ----------
  const syncEpisode = useCallback((time: number, dur: number, force: boolean) => {
    // Episode progress in the series (only if watched > 10s), at most every 5s
    const now = Date.now();
    const storedEpisode = currentSeries?.episodes[currentEpisodeIndex];
    // a few seconds of a finished / further-watched episode must not reset it
    const isPeek = time < 30 && !!storedEpisode &&
      (storedEpisode.completed || (storedEpisode.progress ?? 0) > time);
    if (currentSeries && time > 10 && !isPeek && (force || now - lastEpisodeSyncRef.current >= 5000)) {
      lastEpisodeSyncRef.current = now;
      const progressPercent = Math.round((time / dur) * 100);
      updateEpisode(currentSeries.id, currentEpisodeIndex, {
        duration: dur,
        progress: time,
        completed: progressPercent >= 90,
        lastWatched: Timestamp.now(),
      }, videoUrl);
    }
  }, [currentSeries, currentEpisodeIndex, updateEpisode, videoUrl]);

  const updateMediaPosition = useCallback((time: number, dur: number, rate: number) => {
    const ms = navigator.mediaSession;
    if (!ms || typeof ms.setPositionState !== 'function' || !(dur > 0) || !Number.isFinite(dur)) return;
    try {
      ms.setPositionState({ duration: dur, position: Math.min(Math.max(0, time), dur), playbackRate: rate || 1 });
    } catch { /* ignore */ }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const time = v.currentTime;
    const dur = v.duration;
    setCurrentTime(time);
    lastTimeRef.current = time;
    if (dur > 0 && Number.isFinite(dur)) {
      lastDurRef.current = dur;
      saveProgress(time, dur);
      syncEpisode(time, dur, false);
      const now = Date.now();
      if (now - lastPositionStateRef.current > 5000) {
        lastPositionStateRef.current = now;
        updateMediaPosition(time, dur, v.playbackRate);
      }
    }
  }, [saveProgress, syncEpisode, updateMediaPosition]);

  const updateBuffered = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= t + 0.5 && v.buffered.end(i) >= t) end = Math.max(end, v.buffered.end(i));
    }
    setBufferedEnd(end);
  }, []);

  // Phones kill background tabs: write the exact position when hidden / leaving.
  // Same guards as useVideoProgress.saveProgress, without its 5s throttle.
  const flushProgress = useCallback(() => {
    const time = lastTimeRef.current;
    const dur = lastDurRef.current;
    if (!user || !(dur > 0) || !progressKnown || isProgressLoading) return;
    const saved = savedProgressRef.current;
    if (saved && time < 30 && saved.progress > time) return;
    saveVideoProgress(user.uid, videoUrl, time, dur, title).catch((err) => console.warn('[player] save failed', err));
    syncEpisode(time, dur, true);
  }, [user, progressKnown, isProgressLoading, videoUrl, title, syncEpisode]);
  flushRef.current = flushProgress;

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushRef.current(); };
    const onPageHide = () => flushRef.current();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      flushRef.current(); // leaving the page / switching episode
    };
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setIsLoading(false);
    setVideoError(false);
    if (!autoplayTriedRef.current) {
      autoplayTriedRef.current = true;
      tryPlay();
    }
  }, [tryPlay]);

  // Auto-resume. The saved position can arrive before OR after the metadata.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isSettingsLoading) return;
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
      // the stream playlist was already loaded from the resume point
      if (source.startApplied > 0 && Math.abs(source.startApplied - resumeTime) < 1) {
        if (Math.abs(video.currentTime - resumeTime) > 2) video.currentTime = resumeTime;
        return;
      }
      if (video.currentTime > 30) {
        dismissResumePrompt();
        return;
      }
      video.currentTime = resumeTime;
    };

    if (video.readyState >= 1) {
      seek();
      return;
    }
    video.addEventListener('loadedmetadata', seek, { once: true });
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [videoUrl, showResumePrompt, resumeTime, settings.autoResume, isSettingsLoading, dismissResumePrompt, source.startApplied, source.src]);

  // Default / remembered playback speed (same storage as the extension, via the chrome shim)
  useEffect(() => {
    if (isSettingsLoading) return;
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
  }, [videoUrl, isSettingsLoading, settings.defaultPlaybackSpeed, settings.rememberPlaybackSpeed, source.src]);

  const handleRateChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setSpeed(video.playbackRate);
    if (!settings.rememberPlaybackSpeed) return;
    const key = mediaKeyFromUrl(videoUrl);
    const rate = video.playbackRate;
    chrome.storage.local.get(SPEEDS_STORAGE_KEY, (result) => {
      const speeds: Record<string, number> = { ...(result?.[SPEEDS_STORAGE_KEY] || {}) };
      delete speeds[key];
      speeds[key] = rate;
      const keys = Object.keys(speeds);
      for (const old of keys.slice(0, Math.max(0, keys.length - 200))) delete speeds[old];
      chrome.storage.local.set({ [SPEEDS_STORAGE_KEY]: speeds });
    });
  }, [videoUrl, settings.rememberPlaybackSpeed]);

  // ---------- episodes ----------
  const handleVideoEnded = useCallback(() => {
    if (currentSeries && hasNextEpisode) {
      updateEpisode(currentSeries.id, currentEpisodeIndex, { completed: true }, videoUrl);
      setShowNextEpisode(true);
    }
  }, [currentSeries, hasNextEpisode, currentEpisodeIndex, updateEpisode, videoUrl]);

  const handlePlayNext = useCallback(() => {
    const nextUrl = playNextEpisode();
    if (nextUrl) goToVideo(nextUrl);
  }, [playNextEpisode, goToVideo]);

  const handlePlayPrevious = useCallback(() => {
    const prevUrl = playPreviousEpisode();
    if (prevUrl) goToVideo(prevUrl);
  }, [playPreviousEpisode, goToVideo]);

  handlePlayNextRef.current = handlePlayNext;
  handlePlayPreviousRef.current = handlePlayPrevious;

  const handleReplay = useCallback(() => {
    setShowNextEpisode(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      tryPlay();
    }
  }, [tryPlay]);

  const handleEpisodeSelect = useCallback((episode: Episode) => {
    setShowSidebar(false);
    goToVideo(episode.url);
  }, [goToVideo]);

  const handleStartOver = useCallback(() => {
    dismissResumePrompt();
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      tryPlay();
    }
  }, [dismissResumePrompt, tryPlay]);

  useEffect(() => {
    if (!showResumePrompt) return;
    const timer = setTimeout(() => dismissResumePrompt(), 8000);
    return () => clearTimeout(timer);
  }, [showResumePrompt, dismissResumePrompt]);

  const handleAddToSeries = useCallback(async (seriesId: string, season?: number, episodeNumber?: number) => {
    await addToSeries(seriesId, videoUrl, title, season, episodeNumber);
    await refreshSeries();
    await loadSeriesForVideo(videoUrl);
  }, [videoUrl, title, addToSeries, refreshSeries, loadSeriesForVideo]);

  const handleCreateSeries = useCallback(async (name: string) => createNewSeries(name), [createNewSeries]);

  const handleDeleteSeries = useCallback(async (seriesId: string) => {
    await removeSeries(seriesId);
    await refreshSeries();
    setShowEpisodesSheet(false);
  }, [removeSeries, refreshSeries]);

  // ---------- subtitles ----------
  const handleAddSubtitle = useCallback(async (src: SubtitleSource) => {
    let blobUrl: string;
    if (src.type === 'search') {
      blobUrl = src.data as string;
      if (user && src.subtitleId) {
        saveSubtitlePreference(user.uid, videoUrl, {
          subtitleId: src.subtitleId,
          language: src.language || '',
          languageName: src.languageName || '',
          release: src.release || '',
        }).catch((err) => console.warn('[player] save subtitle preference failed', err));
      }
    } else if (src.type === 'url') {
      blobUrl = createSubtitleBlobUrl(await fetchSubtitle(src.data as string));
    } else {
      blobUrl = createSubtitleBlobUrl(await readSubtitleFile(src.data as File));
    }
    setSubtitles((prev) => [...prev, { label: src.label, src: blobUrl }]);
    setActiveSubtitleIndex(subtitles.length);
  }, [subtitles.length, user, videoUrl]);

  const handleRemoveSubtitle = useCallback((index: number) => {
    const sub = subtitles[index];
    if (sub?.src.startsWith('blob:')) URL.revokeObjectURL(sub.src);
    setSubtitles((prev) => prev.filter((_, i) => i !== index));
    if (activeSubtitleIndex === index) setActiveSubtitleIndex(null);
    else if (activeSubtitleIndex !== null && activeSubtitleIndex > index) setActiveSubtitleIndex(activeSubtitleIndex - 1);
  }, [subtitles, activeSubtitleIndex]);

  // revoke blob URLs on unmount (a new video is a new mount)
  const subtitlesRef = useRef(subtitles);
  subtitlesRef.current = subtitles;
  useEffect(() => () => {
    subtitlesRef.current.forEach((s) => { if (s.src.startsWith('blob:')) URL.revokeObjectURL(s.src); });
  }, []);

  // Sync the active subtitle with the video's text tracks
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    originalCueTimesRef.current = null;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === activeSubtitleIndex ? 'showing' : 'hidden';
    }
    if (activeSubtitleIndex !== null) {
      const track = video.textTracks[activeSubtitleIndex];
      const applyCueSettings = () => {
        if (!track?.cues) return;
        applySubtitleOffset(subtitleOffsetRef.current);
      };
      if (track?.cues && track.cues.length > 0) {
        applyCueSettings();
      } else if (track) {
        const onLoad = () => {
          applyCueSettings();
          track.removeEventListener('cuechange', onLoad);
        };
        track.addEventListener('cuechange', onLoad);
        return () => track.removeEventListener('cuechange', onLoad);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubtitleIndex, subtitles]);

  // Saved subtitle preference
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const preference = await getSubtitlePreference(user.uid, videoUrl);
        if (!preference || cancelled) return;
        const zipBlob = await downloadSubtitle(preference.subtitleId);
        const content = await extractSubtitleFromZip(zipBlob);
        if (cancelled) return;
        const blobUrl = createSubtitleBlobUrl(content);
        setSubtitles([{ label: `${preference.languageName} - ${preference.release}`, src: blobUrl }]);
        setActiveSubtitleIndex(0);
      } catch (err) {
        console.warn('[player] could not load the saved subtitle', err);
      }
    };
    const timer = setTimeout(load, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [videoUrl, user]);

  // ---------- titles ----------
  const titleParts = useMemo(() => {
    const parsed = parseMediaUrl(videoUrl);
    if (parsed.kind === 'episode' && parsed.episode !== undefined) {
      const name = currentSeries?.name || parsed.title || title;
      const detail = parsed.season !== undefined
        ? `Season ${parsed.season} · Episode ${parsed.episode}`
        : `Episode ${parsed.episode}`;
      return { name, detail };
    }
    if (parsed.kind === 'movie') return { name: parsed.title, detail: String(parsed.year) };
    return { name: title, detail: '' };
  }, [videoUrl, title, currentSeries?.name]);

  // ---------- Media Session (lock screen / headset controls) ----------
  const poster = usePoster(filenameFromUrl(videoUrl));
  const artwork = savedProgress?.posterUrl || poster.poster;
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || typeof MediaMetadata === 'undefined') return;
    try {
      ms.metadata = new MediaMetadata({
        title: titleParts.detail && currentSeries ? `${titleParts.name} · ${titleParts.detail}` : titleParts.name,
        artist: titleParts.detail && !currentSeries ? titleParts.detail : 'StreamWatch',
        artwork: artwork ? [{ src: artwork, sizes: '342x513', type: 'image/jpeg' }] : [],
      });
    } catch { /* ignore */ }
  }, [titleParts, artwork, currentSeries]);

  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { ms.setActionHandler(action, handler); } catch { /* unsupported action */ }
    };
    set('play', () => tryPlay());
    set('pause', () => videoRef.current?.pause());
    set('seekbackward', (d) => seekBy(-(d.seekOffset || 10)));
    set('seekforward', (d) => seekBy(d.seekOffset || 10));
    set('seekto', (d) => {
      const v = videoRef.current;
      if (!v || d.seekTime == null) return;
      if (d.fastSeek && typeof v.fastSeek === 'function') v.fastSeek(d.seekTime);
      else v.currentTime = d.seekTime;
    });
    set('previoustrack', hasPreviousEpisode ? () => handlePlayPreviousRef.current() : null);
    set('nexttrack', hasNextEpisode ? () => handlePlayNextRef.current() : null);
    return () => {
      (['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'] as MediaSessionAction[])
        .forEach((a) => set(a, null));
    };
  }, [tryPlay, seekBy, hasNextEpisode, hasPreviousEpisode]);

  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    try { ms.playbackState = isPlaying ? 'playing' : 'paused'; } catch { /* ignore */ }
  }, [isPlaying]);

  // ---------- errors ----------
  const retryPlayback = useCallback(() => {
    setVideoError(false);
    setIsLoading(true);
    setNeedsTap(false);
    if (source.mode === 'stream') {
      source.retry();
    } else {
      videoRef.current?.load();
      tryPlay();
    }
  }, [source, tryPlay]);

  const handleVideoError = useCallback(() => {
    const err = videoRef.current?.error;
    // A link the browser can't decode (e.g. MKV): try the streaming server once, before anything played
    if (
      source.mode === 'direct' &&
      !hasPlayedRef.current &&
      err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED &&
      source.fallbackToStream()
    ) {
      setIsLoading(true);
      return;
    }
    setIsLoading(false);
    setVideoError(true);
  }, [source]);

  const homeButton = (
    <button className="btn-ghost" onClick={goHome}>Home</button>
  );
  const genericError = {
    title: "This video can't be played",
    message: `The link may have expired or the format isn't supported. Open the video again from the page you got it from${currentTime > 0 || resumeTime > 0 ? ' — your progress is saved and it will resume where you left off.' : '.'}`,
    buttons: (
      <>
        {sourcePageUrl && <a href={sourcePageUrl} target="_blank" rel="noreferrer" className="btn-primary no-underline">Open source page</a>}
        <button className="btn-secondary" onClick={retryPlayback}>Try again</button>
        {homeButton}
      </>
    ),
  };

  let errorView: { title: string; message: string; buttons: ReactElement } | null = null;
  const streamCode: StreamErrorCode | null = source.streamError;
  if (streamCode) {
    const minorAfterFallback = source.fellBack && ['network', 'internal', 'unauthorized', 'forbidden', 'bad_url'].includes(streamCode);
    if (minorAfterFallback) {
      // the direct link failed first; that is the more likely story (e.g. an expired link)
      errorView = genericError;
    } else if (streamCode === 'unauthorized') {
      errorView = {
        title: 'Sign in to watch',
        message: 'This video plays through the StreamWatch streaming server, which needs you to be signed in.',
        buttons: (
          <>
            <button className="btn-primary" onClick={async () => { await signIn(); retryPlayback(); }}>Sign in</button>
            {homeButton}
          </>
        ),
      };
    } else if (streamCode === 'forbidden') {
      errorView = {
        title: "This account can't stream here",
        message: 'Your account is not on the streaming server’s allowed list. Ask the person who runs it to add you.',
        buttons: homeButton,
      };
    } else if (streamCode === 'source_gone') {
      errorView = {
        title: 'This link has expired',
        message: `Open the video again from the page you got it from${resumeTime > 0 ? ' — your progress is saved and it will resume where you left off.' : '.'}`,
        buttons: (
          <>
            {sourcePageUrl && <a href={sourcePageUrl} target="_blank" rel="noreferrer" className="btn-primary no-underline">Open source page</a>}
            {homeButton}
          </>
        ),
      };
    } else if (streamCode === 'unsupported') {
      errorView = {
        title: "Can't play this file here",
        message: 'This file cannot be streamed to this device. Try watching it on a computer.',
        buttons: homeButton,
      };
    } else if (streamCode === 'bad_url') {
      errorView = {
        title: "This video can't be played",
        message: 'This link does not point to a video the streaming server can open.',
        buttons: homeButton,
      };
    } else {
      errorView = {
        title: "Can't reach the streaming server",
        message: 'The streaming server did not answer. Check your connection and try again.',
        buttons: (
          <>
            <button className="btn-primary" onClick={retryPlayback}>Try again</button>
            {homeButton}
          </>
        ),
      };
    }
  } else if (videoError || source.hlsFailed) {
    errorView = genericError;
  }
  const hasError = !!errorView;

  // ---------- render ----------
  const hasSeries = !!user && !!currentSeries;
  const progressPct = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
  const showResume = showResumePrompt && !isLoading && !showNextEpisode && !hasError;
  const touchOverlaysBlocking = hasError || needsTap || (showNextEpisode && !!currentSeries);

  const rootClass = desktop
    ? 'h-[100dvh] overflow-hidden bg-black text-white'
    : landscape
    ? 'h-[100dvh] overflow-hidden bg-black text-white'
    : 'min-h-[100dvh] bg-sw-bg text-sw-text overflow-x-hidden';
  const stageClass = desktop
    ? 'w-full h-full flex items-center justify-center bg-black relative'
    : landscape
    ? 'fixed inset-0 bg-black'
    : 'sticky top-0 z-30 bg-black pt-safe';
  const boxClass = desktop
    ? `relative group/player bg-black w-full h-full flex items-center justify-center ${isFullscreen && !showControls && isPlaying ? 'cursor-none' : ''}`
    : `player-box relative bg-black overflow-hidden w-full ${landscape ? 'h-full' : 'aspect-video'}`;

  return (
    <div
      className={`${rootClass} transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}
      onMouseUp={desktop ? () => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && !isTextEntry(active)) active.blur();
      } : undefined}
    >
      {desktop ? (
        <TopBar sidebarOpen={showSidebar} onToggleSidebar={() => setShowSidebar(!showSidebar)} onShowShortcuts={() => setShowShortcuts(true)} hasSeries={hasSeries} />
      ) : null}
      {desktop && user ? (
        <CapsuleActions sidebarOpen={showSidebar} onSubtitles={() => setShowSubtitleModal(true)} onAddToSeries={() => setShowAddModal(true)} />
      ) : null}
      {desktop ? <KeyboardLegend isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} /> : null}

      {/* stage: holds the video in every layout, so rotating never reloads it */}
      <div className={stageClass}>
        <div
          ref={containerRef}
          className={boxClass}
          onMouseMove={desktop ? (e) => {
            if (e.clientX === lastMousePosRef.current.x && e.clientY === lastMousePosRef.current.y) return;
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };
            pokeControls();
          } : undefined}
          onMouseLeave={desktop ? () => { if (isPlayingRef.current) setShowControls(false); } : undefined}
        >
          {/* Loading: opaque for the first load, just a spinner while buffering */}
          {isLoading && !hasError && !needsTap ? (
            <div className={`absolute inset-0 flex items-center justify-center z-10 pointer-events-none animate-fade-in ${duration > 0 ? '' : 'bg-black/80'}`}>
              <div className="text-center">
                <div className={`${portrait ? 'w-10 h-10 mb-2' : 'w-12 h-12 mb-4'} border-4 border-sw-red/30 border-t-sw-red rounded-full animate-spin mx-auto`} />
                {duration === 0 && <p className="text-sw-text-secondary text-sm">Loading video...</p>}
              </div>
            </div>
          ) : null}

          {errorView ? (
            <ErrorScreen compact={portrait} title={errorView.title} message={errorView.message}>
              {errorView.buttons}
            </ErrorScreen>
          ) : null}

          {showResume && !portrait ? (
            <ResumeNotice
              resumeTime={resumeTime}
              onStartOver={handleStartOver}
              onDismiss={dismissResumePrompt}
              compact={landscape}
              className={desktop ? 'absolute left-5 bottom-24' : 'absolute player-resume-landscape'}
            />
          ) : null}

          {currentSeries && desktop ? (
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
          ) : null}
          {currentSeries && !desktop ? (
            <NextEpisodeCompact
              series={currentSeries}
              currentEpisodeIndex={currentEpisodeIndex}
              isVisible={showNextEpisode}
              autoplay={settings.autoPlayNext}
              autoplayDelay={settings.autoPlayDelay}
              onPlayNext={handlePlayNext}
              onCancel={() => setShowNextEpisode(false)}
              onReplay={handleReplay}
            />
          ) : null}

          <video
            ref={videoRef}
            src={source.src}
            playsInline
            preload="auto"
            className={desktop
              ? `max-w-full max-h-full ${isFullscreen ? 'w-full h-full object-contain' : ''} ${showControls || !isPlaying ? 'cursor-pointer' : 'cursor-none'}`
              : 'absolute inset-0 w-full h-full object-contain'}
            onClick={desktop ? () => {
              if (clickTimeoutRef.current) { clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null; return; }
              clickTimeoutRef.current = setTimeout(() => { clickTimeoutRef.current = null; togglePlay(); }, 200);
            } : undefined}
            onDoubleClick={desktop ? () => {
              if (clickTimeoutRef.current) { clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null; }
              toggleFullscreen();
            } : undefined}
            onTimeUpdate={handleTimeUpdate}
            onProgress={updateBuffered}
            onSeeked={updateBuffered}
            onLoadedMetadata={handleLoadedMetadata}
            onDurationChange={() => { const v = videoRef.current; if (v && v.duration > 0) setDuration(v.duration); }}
            onCanPlay={() => setIsLoading(false)}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => { hasPlayedRef.current = true; setIsLoading(false); setNeedsTap(false); }}
            onError={handleVideoError}
            onRateChange={handleRateChange}
            onEnded={handleVideoEnded}
            onPlay={() => {
              setIsPlaying(true);
              isPlayingRef.current = true;
              setNeedsTap(false);
              if (!desktop) pokeControls();
            }}
            onPause={() => {
              setIsPlaying(false);
              isPlayingRef.current = false;
              // save the exact stop position right away
              lastEpisodeSyncRef.current = 0;
              handleTimeUpdate();
              const v = videoRef.current;
              if (v) updateMediaPosition(v.currentTime, v.duration, v.playbackRate);
            }}
            onVolumeChange={() => {
              const v = videoRef.current;
              if (v) { setVolume(v.volume); setIsMuted(v.muted); }
            }}
          >
            {subtitles.map((sub, index) => (
              <track key={`${sub.src}-${index}`} kind="subtitles" label={sub.label} src={sub.src} default={activeSubtitleIndex === index} />
            ))}
          </video>

          {/* Title overlay (desktop, hidden in fullscreen) */}
          {desktop && !isFullscreen ? (
            <div className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-24 pt-[72px] px-8 pointer-events-none transition-opacity duration-300 z-10 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
              <h1 className="font-heading text-white font-bold leading-[1.1] drop-shadow-lg truncate pb-1" style={{ fontSize: 'clamp(28px, 4vw, 56px)' }}>{titleParts.name}</h1>
              {titleParts.detail && <p className="font-body text-white/75 text-lg font-medium mt-1 drop-shadow">{titleParts.detail}</p>}
            </div>
          ) : null}

          {/* Touch gesture layer: tap toggles controls, double tap left/right seeks */}
          {!desktop ? (
            <div className="player-gesture absolute inset-0 z-[15]" onClick={handleGestureTap} aria-hidden="true" />
          ) : null}

          {actionOverlay ? <ActionFlash key={actionOverlay.key} flash={actionOverlay} /> : null}

          {subtitleOffsetIndicator ? (
            <div key={subtitleOffsetIndicator.key} className="absolute top-4 right-4 pointer-events-none animate-action-flash z-20">
              <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2">
                <span className="text-white text-sm font-medium">{subtitleOffsetIndicator.text}</span>
              </div>
            </div>
          ) : null}

          {desktop ? (
            <DesktopControls
              videoRef={videoRef}
              visible={controlsVisible}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              isMuted={isMuted}
              isFullscreen={isFullscreen}
              hasSeries={!!currentSeries}
              hasPreviousEpisode={hasPreviousEpisode}
              hasNextEpisode={hasNextEpisode}
              onTogglePlay={() => togglePlay()}
              onSeekBy={(s) => seekBy(s)}
              onPrevious={handlePlayPrevious}
              onNext={handlePlayNext}
              onFullscreen={toggleFullscreen}
            />
          ) : null}

          {!desktop ? (
            <TouchControls
              layout={landscape ? 'landscape' : 'portrait'}
              visible={controlsVisible && !touchOverlaysBlocking}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              bufferedEnd={bufferedEnd}
              speed={speed}
              isFullscreen={isFullscreen}
              title={titleParts.name}
              detail={titleParts.detail}
              capsule={landscape && user ? (
                <TouchCapsule onSubtitles={() => setShowSubtitleModal(true)} onAddToSeries={() => setShowAddModal(true)} />
              ) : undefined}
              onBack={goHome}
              onTogglePlay={() => togglePlay(false)}
              onSeekBy={(s) => seekBy(s)}
              onSeekTo={(t) => { const v = videoRef.current; if (v) v.currentTime = t; setCurrentTime(t); }}
              onSubtitles={() => setShowSubtitleModal(true)}
              onSpeed={() => setShowSpeedSheet(true)}
              onEpisodes={hasSeries ? () => {
                if (landscape) setShowEpisodesSheet(true);
                else episodesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } : undefined}
              onFullscreen={toggleFullscreen}
              onInteracting={setInteracting}
            />
          ) : null}

          {needsTap && !hasError ? (
            <TapToPlay onPlay={tryPlay} label={isTouch ? 'Tap to play' : 'Click to play'} />
          ) : null}
        </div>

        {/* portrait: the resume notice sits just under the video instead of covering it */}
        {portrait && showResume ? (
          <div className="px-gutter py-2 bg-black">
            <ResumeNotice resumeTime={resumeTime} onStartOver={handleStartOver} onDismiss={dismissResumePrompt} compact className="inline-block max-w-full" />
          </div>
        ) : null}
      </div>

      {portrait ? (
        <div className="px-gutter pt-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
          <h1 className="font-heading text-xl font-bold leading-tight text-sw-text break-words">{titleParts.name}</h1>
          {titleParts.detail && <p className="font-body text-sm text-sw-text-secondary mt-1">{titleParts.detail}</p>}

          {duration > 0 && (
            <div className="mt-3">
              <div className="flex justify-between font-body text-xs text-sw-text-muted mb-1.5 tabular-nums">
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                <span>{progressPct}% watched</span>
              </div>
              <div className="h-1 bg-sw-surface rounded-full overflow-hidden">
                <div className="h-full bg-sw-red transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {user ? (
              <TouchCapsule labels onSubtitles={() => setShowSubtitleModal(true)} onAddToSeries={() => setShowAddModal(true)} />
            ) : !isAuthLoading ? (
              <button className="btn-primary min-h-[44px]" onClick={() => signIn()}>Sign in to sync your progress</button>
            ) : null}
            {hasSeries && hasNextEpisode && (
              <button className="btn-secondary min-h-[44px] flex items-center gap-2 px-4" onClick={handlePlayNext}>
                Next episode
              </button>
            )}
          </div>

          {hasSeries && currentSeries ? (
            <div ref={episodesRef} className="mt-6 player-episodes-anchor">
              <EpisodeList
                series={currentSeries}
                currentEpisodeIndex={currentEpisodeIndex}
                currentVideoUrl={videoUrl}
                onEpisodeSelect={handleEpisodeSelect}
                onDeleteSeries={handleDeleteSeries}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {desktop && currentSeries ? (
        <SeriesSidebar
          series={currentSeries}
          currentEpisodeIndex={currentEpisodeIndex}
          currentVideoUrl={videoUrl}
          isOpen={showSidebar}
          onClose={() => setShowSidebar(false)}
          onEpisodeSelect={handleEpisodeSelect}
          onDeleteSeries={handleDeleteSeries}
        />
      ) : null}

      {/* landscape: episode list in a bottom sheet */}
      {hasSeries && currentSeries ? (
        <Dialog open={showEpisodesSheet && !desktop} onClose={() => setShowEpisodesSheet(false)} sheet tall label="Episodes">
          <div className="px-4 pb-4 pt-1">
            <EpisodeList
              series={currentSeries}
              currentEpisodeIndex={currentEpisodeIndex}
              currentVideoUrl={videoUrl}
              onEpisodeSelect={handleEpisodeSelect}
              onDeleteSeries={handleDeleteSeries}
            />
          </div>
        </Dialog>
      ) : null}

      <AddToSeriesModal
        isOpen={showAddModal}
        sheet={!desktop}
        onClose={async () => { setShowAddModal(false); await refreshSeries(); await loadSeriesForVideo(videoUrl); }}
        allSeries={allSeries}
        videoUrl={videoUrl}
        videoTitle={title}
        onAddToSeries={handleAddToSeries}
        onCreateSeries={handleCreateSeries}
      />

      <SubtitleModal
        isOpen={showSubtitleModal}
        sheet={!desktop}
        onClose={() => setShowSubtitleModal(false)}
        onAddSubtitle={handleAddSubtitle}
        currentSubtitles={subtitles}
        onRemoveSubtitle={handleRemoveSubtitle}
        activeSubtitleIndex={activeSubtitleIndex}
        onSelectSubtitle={setActiveSubtitleIndex}
        videoTitle={title}
        subtitleOffset={subtitleOffset}
        onShiftSubtitles={shiftSubtitles}
      />

      {!desktop ? (
        <SpeedSheet
          isOpen={showSpeedSheet}
          speed={speed}
          onSelect={(s) => {
            const v = videoRef.current;
            if (v) v.playbackRate = s;
            setShowSpeedSheet(false);
          }}
          onClose={() => setShowSpeedSheet(false)}
        />
      ) : null}
    </div>
  );
}
