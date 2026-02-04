import { useEffect, useState, useCallback, useRef } from 'react';
import { extractTitleFromUrl, extractHost, formatTime } from '@/lib/utils';
import { parseEpisodeInfo } from '@/lib/episodeParser';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { useSeries } from '@/hooks/useSeries';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';
import SeriesSidebar from './components/SeriesSidebar';
import NextEpisodeOverlay from './components/NextEpisodeOverlay';
import AddToSeriesModal from './components/AddToSeriesModal';
import SubtitleModal, { SubtitleSource } from './components/SubtitleModal';
import { Episode } from '@/types';
import { fetchSubtitle, readSubtitleFile, createSubtitleBlobUrl } from '@/lib/subtitles';
import { saveSubtitlePreference, getSubtitlePreference } from '@/lib/firestore';
import { downloadSubtitle, extractSubtitleFromZip } from '@/lib/subtitleSearch';

// Extract a clean title from a video URL using the episode parser, with fallback
function getVideoTitle(url: string): string {
  // Try episode parser first (series with S01E01 etc.)
  const parsed = parseEpisodeInfo(url);
  if (parsed) {
    return parsed.title; // e.g., "Breaking Bad S01E01"
  }

  // Try movie title extraction (year-based: "Movie Name 2025 WEB-DL ...")
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const filename = pathname.split('/').pop() || '';
    const name = filename.replace(/\.[^.]+$/, '').replace(/[\._-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const yearMatch = name.match(/^(.+?)\s+((?:19|20)\d{2})(?:\s|$)/);
    if (yearMatch && yearMatch[1].trim().length > 0) {
      return `${yearMatch[1].trim()} (${yearMatch[2]})`;
    }
  } catch { /* fall through */ }

  return extractTitleFromUrl(url);
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
  const [sourceHost, setSourceHost] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const actionKeyRef = useRef(0);

  // Progress tracking hook
  const {
    showResumePrompt,
    resumeTime,
    saveProgress,
    dismissResumePrompt,
    acceptResume,
  } = useVideoProgress({
    videoUrl: videoUrl || '',
    title,
    saveInterval: 5000,
  });

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
        host: extractHost(url)
      });
      setVideoUrl(url);
      setTitle(getVideoTitle(url));
      setSourceHost(extractHost(url));
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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
          break;

        case '>':
          e.preventDefault();
          video.playbackRate = Math.min(2, video.playbackRate + 0.25);
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
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [subtitles, activeSubtitleIndex]);

  // Navigate to new video
  const navigateToVideo = useCallback((url: string, episodeTitle?: string) => {
    logger.info('player', 'NAVIGATE_TO_VIDEO', { url: url.substring(0, 50) + '...', title: episodeTitle });

    // Update URL and reload
    const playerUrl = `${window.location.pathname}?url=${encodeURIComponent(url)}`;
    window.history.pushState({}, '', playerUrl);

    // Update state
    setVideoUrl(url);
    setTitle(episodeTitle || getVideoTitle(url));
    setSourceHost(extractHost(url));
    document.title = `${episodeTitle || getVideoTitle(url)} - StreamWatch`;
    setShowNextEpisode(false);
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

        // Also update episode progress in series
        if (currentSeries) {
          const progressPercent = Math.round((time / dur) * 100);
          if (progressPercent >= 90) {
            updateEpisode(currentSeries.id, currentEpisodeIndex, {
              duration: dur,
              progress: time,
              completed: true,
            });
          }
        }
      }
    }
  }, [saveProgress, currentSeries, currentEpisodeIndex, updateEpisode]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      logger.info('player', 'VIDEO_METADATA_LOADED', {
        duration: Math.round(dur),
        durationFormatted: formatTime(dur)
      });
      setDuration(dur);
      setIsLoading(false);

      // Update episode duration in series
      if (currentSeries) {
        updateEpisode(currentSeries.id, currentEpisodeIndex, { duration: dur });
      }
    }
  }, [currentSeries, currentEpisodeIndex, updateEpisode]);

  const handleVideoEnded = useCallback(() => {
    logger.info('player', 'VIDEO_ENDED', { hasNextEpisode, seriesName: currentSeries?.name });

    if (currentSeries && hasNextEpisode) {
      // Mark current as completed
      updateEpisode(currentSeries.id, currentEpisodeIndex, { completed: true });
      // Show next episode overlay
      setShowNextEpisode(true);
    }
  }, [currentSeries, hasNextEpisode, currentEpisodeIndex, updateEpisode]);

  const handlePlayNext = useCallback(() => {
    const nextUrl = playNextEpisode();
    if (nextUrl && currentSeries) {
      const nextEpisode = currentSeries.episodes[currentEpisodeIndex + 1];
      navigateToVideo(nextUrl, nextEpisode?.title);
    }
  }, [playNextEpisode, currentSeries, currentEpisodeIndex, navigateToVideo]);

  const handlePlayPrevious = useCallback(() => {
    const prevUrl = playPreviousEpisode();
    if (prevUrl && currentSeries) {
      const prevEpisode = currentSeries.episodes[currentEpisodeIndex - 1];
      navigateToVideo(prevUrl, prevEpisode?.title);
    }
  }, [playPreviousEpisode, currentSeries, currentEpisodeIndex, navigateToVideo]);

  const handleReplay = useCallback(() => {
    setShowNextEpisode(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      safePlay(videoRef.current);
    }
  }, []);

  const handleEpisodeSelect = useCallback((episode: Episode) => {
    setShowSidebar(false);
    navigateToVideo(episode.url, episode.title);
  }, [navigateToVideo]);

  const handleResume = useCallback(() => {
    const time = acceptResume();
    logger.info('player', 'USER_RESUME', { resumeAt: Math.round(time), formatted: formatTime(time) });
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      safePlay(videoRef.current);
    }
  }, [acceptResume]);

  const handleStartFromBeginning = useCallback(() => {
    logger.info('player', 'USER_START_OVER');
    dismissResumePrompt();
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      safePlay(videoRef.current);
    }
  }, [dismissResumePrompt]);

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

      // Auto-select if it's the first subtitle
      if (subtitles.length === 0) {
        setActiveSubtitleIndex(0);
      }

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
    }
  }, [videoUrl]);

  // Sync active subtitle with video text tracks
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      track.mode = i === activeSubtitleIndex ? 'showing' : 'hidden';
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

  const progressPercent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;

  if (!videoUrl) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-sw-dark text-white flex items-center justify-center">
        <div className={`text-center transition-all duration-500 ${isReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-sw-red/20 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <h1 className="text-3xl font-bold">
              <span className="text-sw-red">Stream</span>Watch
            </h1>
          </div>
          <p className="text-sw-light-gray mb-2">No video URL provided</p>
          <p className="text-sm text-sw-gray">
            Right-click a video link and select "Play in StreamWatch"
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen overflow-hidden flex bg-sw-dark text-white transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
      {/* Left Panel - Video Player */}
      <div className="flex-1 flex items-center justify-center bg-black relative min-w-0">
        {/* Video + Custom Controls wrapper */}
        <div
          ref={containerRef}
          className={`relative group/player bg-black w-full h-full flex items-center justify-center ${isFullscreen ? 'w-screen h-screen' : ''}`}
          onMouseMove={() => {
            setShowControls(true);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = setTimeout(() => {
              if (isPlaying) setShowControls(false);
            }, 3000);
          }}
          onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
        >
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-sw-red/30 border-t-sw-red rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-sw-light-gray text-sm">Loading video...</p>
              </div>
            </div>
          )}

          {/* Resume Prompt Overlay */}
          {showResumePrompt && !isLoading && !showNextEpisode && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
              <div className="bg-gray-900/95 rounded-2xl p-6 max-w-sm mx-4 border border-gray-700/50 shadow-2xl animate-fade-in">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto bg-sw-red/20 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-sw-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Resume Watching?</h3>
                  <p className="text-sw-gray text-sm">
                    You left off at <span className="text-sw-red font-medium">{formatTime(resumeTime)}</span>
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleStartFromBeginning}
                    className="flex-1 py-3 px-4 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 active:scale-95 transition-all duration-200"
                  >
                    Start Over
                  </button>
                  <button
                    onClick={handleResume}
                    className="flex-1 py-3 px-4 bg-sw-red text-white rounded-lg font-medium hover:bg-red-600 active:scale-95 transition-all duration-200 shadow-lg shadow-sw-red/20"
                  >
                    Resume
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Next Episode Overlay */}
          {currentSeries && (
            <NextEpisodeOverlay
              series={currentSeries}
              currentEpisodeIndex={currentEpisodeIndex}
              isVisible={showNextEpisode}
              autoplayDelay={5}
              onPlayNext={handlePlayNext}
              onCancel={() => setShowNextEpisode(false)}
              onReplay={handleReplay}
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
            onEnded={handleVideoEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
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
            <div className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-24 pt-6 px-8 pointer-events-none transition-opacity duration-300 z-10 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}>
              <h1 className="text-white text-[60px] font-bold leading-none drop-shadow-lg" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
              <p className="text-white/50 text-lg mt-2 drop-shadow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sourceHost}</p>
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
              <button className="text-white hover:text-sw-red transition-colors" onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) { safePlay(v); flashOverlay('play'); } else { v.pause(); flashOverlay('pause'); } }}>
                {isPlaying
                  ? <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  : <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                }
              </button>

              {/* Skip Back 15s */}
              <button className="text-white hover:text-sw-red transition-colors relative" title="Back 15s" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 15); flashOverlay('seekBack'); } }}>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] text-[7px] font-bold">15</span>
              </button>

              {/* Skip Forward 15s */}
              <button className="text-white hover:text-sw-red transition-colors relative" title="Forward 15s" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 15); flashOverlay('seekForward'); } }}>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] text-[7px] font-bold">15</span>
              </button>

              {/* Time */}
              <span className="text-white text-sm font-mono tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>

              <div className="flex-1" />

              {/* Volume */}
              <div className="flex items-center gap-2 group/vol">
                <button className="text-white hover:text-sw-red transition-colors" onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }}>
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
              <button className="text-white hover:text-sw-red transition-colors" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else containerRef.current?.requestFullscreen(); }}>
                {isFullscreen
                  ? <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
                  : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Info & Controls */}
      <div className={`w-[320px] flex-shrink-0 bg-sw-dark flex flex-col p-5 border-l border-gray-800 overflow-y-auto transition-all duration-500 ${!isLoading ? 'opacity-100' : 'opacity-50'}`}>
        {/* Series Badge & Navigation */}
        {currentSeries && (
          <div className="mb-4">
            <button
              onClick={() => setShowSidebar(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-sw-red/20 text-sw-red rounded-lg text-sm font-medium hover:bg-sw-red/30 transition-colors mb-2"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="truncate">{currentSeries.name}</span>
              <span className="text-white/70 flex-shrink-0">({currentEpisodeIndex + 1}/{currentSeries.episodes.length})</span>
            </button>

            {/* Episode Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayPrevious}
                disabled={!hasPreviousEpisode}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 text-white text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                title="Previous episode"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>
              <button
                onClick={handlePlayNext}
                disabled={!hasNextEpisode}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 text-white text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                title="Next episode"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-gray-800 mb-4" />

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="group flex items-center gap-2 py-2.5 px-4 bg-sw-red text-white rounded-lg font-medium text-sm hover:bg-red-600 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-sw-red/20"
          >
            <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {currentSeries ? 'Add to Another Series' : 'Add to Series'}
          </button>

          {currentSeries && (
            <button
              onClick={() => setShowSidebar(true)}
              className="group flex items-center gap-2 py-2.5 px-4 bg-gray-800 text-white rounded-lg font-medium text-sm hover:bg-gray-700 active:scale-[0.98] transition-all duration-200 border border-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              Episodes
            </button>
          )}

          <button
            onClick={() => setShowSubtitleModal(true)}
            className={`group flex items-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm active:scale-[0.98] transition-all duration-200 border ${
              subtitles.length > 0
                ? 'bg-sw-red/20 text-sw-red border-sw-red/30 hover:bg-sw-red/30'
                : 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            Subtitles
            {subtitles.length > 0 && (
              <span className="text-xs bg-sw-red/30 px-1.5 py-0.5 rounded ml-auto">
                {activeSubtitleIndex !== null ? 'ON' : 'OFF'}
              </span>
            )}
          </button>

          <button className="group flex items-center gap-2 py-2.5 px-4 bg-gray-800/50 text-sw-light-gray rounded-lg font-medium text-sm hover:bg-gray-800 hover:text-white active:scale-[0.98] transition-all duration-200 border border-gray-700/50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Keyboard Hints */}
        <div className="pt-4 border-t border-gray-800 mt-4">
          <p className="text-[10px] text-sw-gray uppercase tracking-wider mb-2">Keyboard Shortcuts</p>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] text-sw-gray">
            <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-[9px]">Space</kbd> Play/Pause</span>
            <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-[9px]">F</kbd> Fullscreen</span>
            <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-[9px]">M</kbd> Mute</span>
            <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-[9px]">C</kbd> Subtitles</span>
            <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-[9px]">←→</kbd> Seek 15s</span>
            <span><kbd className="px-1 py-0.5 bg-gray-800 rounded text-[9px]">↑↓</kbd> Volume</span>
          </div>
        </div>
      </div>

      {/* Series Sidebar */}
      {currentSeries && (
        <SeriesSidebar
          series={currentSeries}
          currentEpisodeIndex={currentEpisodeIndex}
          isOpen={showSidebar}
          onClose={() => setShowSidebar(false)}
          onEpisodeSelect={handleEpisodeSelect}
          onDeleteSeries={handleDeleteSeries}
        />
      )}

      {/* Add to Series Modal */}
      <AddToSeriesModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
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
