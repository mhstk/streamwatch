import { useEffect, useState, useCallback, useRef } from 'react';
import { extractTitleFromUrl, extractHost, formatTime } from '@/lib/utils';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { useSeries } from '@/hooks/useSeries';
import { logger } from '@/lib/logger';
import SeriesSidebar from './components/SeriesSidebar';
import NextEpisodeOverlay from './components/NextEpisodeOverlay';
import AddToSeriesModal from './components/AddToSeriesModal';
import { Episode } from '@/types';

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
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Load video from URL params
  useEffect(() => {
    logger.info('player', 'Player mounted');
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');

    if (url) {
      logger.info('player', 'VIDEO_LOAD', {
        url: url.substring(0, 80) + '...',
        title: extractTitleFromUrl(url),
        host: extractHost(url)
      });
      setVideoUrl(url);
      setTitle(extractTitleFromUrl(url));
      setSourceHost(extractHost(url));
      document.title = `${extractTitleFromUrl(url)} - StreamWatch`;
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

  // Navigate to new video
  const navigateToVideo = useCallback((url: string, episodeTitle?: string) => {
    logger.info('player', 'NAVIGATE_TO_VIDEO', { url: url.substring(0, 50) + '...', title: episodeTitle });

    // Update URL and reload
    const playerUrl = `${window.location.pathname}?url=${encodeURIComponent(url)}`;
    window.history.pushState({}, '', playerUrl);

    // Update state
    setVideoUrl(url);
    setTitle(episodeTitle || extractTitleFromUrl(url));
    setSourceHost(extractHost(url));
    document.title = `${episodeTitle || extractTitleFromUrl(url)} - StreamWatch`;
    setShowNextEpisode(false);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);

    // Load video
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play();
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
      videoRef.current.play();
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
      videoRef.current.play();
    }
  }, [acceptResume]);

  const handleStartFromBeginning = useCallback(() => {
    logger.info('player', 'USER_START_OVER');
    dismissResumePrompt();
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  }, [dismissResumePrompt]);

  const handleAddToSeries = useCallback(async (seriesId: string) => {
    if (videoUrl) {
      await addToSeries(seriesId, videoUrl, title);
      await refreshSeries();
      // Reload series context
      await loadSeriesForVideo(videoUrl);
    }
  }, [videoUrl, title, addToSeries, refreshSeries, loadSeriesForVideo]);

  const handleCreateSeries = useCallback(async (name: string) => {
    return createNewSeries(name);
  }, [createNewSeries]);

  const handleAddEpisodeToSeries = useCallback(async (seriesId: string, url: string, episodeTitle: string) => {
    await addToSeries(seriesId, url, episodeTitle);
  }, [addToSeries]);

  const handleDeleteSeries = useCallback(async (seriesId: string) => {
    await removeSeries(seriesId);
    await refreshSeries();
  }, [removeSeries, refreshSeries]);

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
    <div className={`min-h-screen bg-sw-dark text-white transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
      {/* Video Player Container */}
      <div className="relative w-full bg-black">
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
          controls
          autoPlay
          className="w-full max-h-[80vh] mx-auto"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => setIsLoading(false)}
          onEnded={handleVideoEnded}
        >
          Your browser does not support the video tag.
        </video>
      </div>

      {/* Video Info Section */}
      <div className={`p-6 max-w-5xl mx-auto transition-all duration-500 delay-200 ${!isLoading ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Series Badge & Navigation */}
        {currentSeries && (
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => setShowSidebar(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-sw-red/20 text-sw-red rounded-full text-sm font-medium hover:bg-sw-red/30 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {currentSeries.name}
              <span className="text-white/70">({currentEpisodeIndex + 1}/{currentSeries.episodes.length})</span>
            </button>

            {/* Episode Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayPrevious}
                disabled={!hasPreviousEpisode}
                className="p-2 rounded-lg bg-gray-800 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                title="Previous episode"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={handlePlayNext}
                disabled={!hasNextEpisode}
                className="p-2 rounded-lg bg-gray-800 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                title="Next episode"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Title & Source */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">{title}</h1>
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-sw-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <span className="text-sw-gray">Source:</span>
            <span className="text-sw-light-gray">{sourceHost}</span>
          </div>
        </div>

        {/* Progress Card */}
        {duration > 0 && (
          <div className="bg-gray-800/50 rounded-xl p-4 mb-6 backdrop-blur-sm border border-gray-700/50">
            <div className="flex justify-between text-sm mb-3">
              <span className="text-white font-medium">{formatTime(currentTime)}</span>
              <span className="text-sw-red font-medium">{progressPercent}% watched</span>
              <span className="text-sw-gray">{formatTime(duration)}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sw-red to-red-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="group flex items-center gap-2 py-3 px-5 bg-sw-red text-white rounded-lg font-medium hover:bg-red-600 active:scale-95 transition-all duration-200 shadow-lg shadow-sw-red/20"
          >
            <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {currentSeries ? 'Add to Another Series' : 'Add to Series'}
          </button>

          {currentSeries && (
            <button
              onClick={() => setShowSidebar(true)}
              className="group flex items-center gap-2 py-3 px-5 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 active:scale-95 transition-all duration-200 border border-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              Episodes
            </button>
          )}

          <button className="group flex items-center gap-2 py-3 px-5 bg-gray-800/50 text-sw-light-gray rounded-lg font-medium hover:bg-gray-800 hover:text-white active:scale-95 transition-all duration-200 border border-gray-700/50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-sw-dark to-transparent pointer-events-none">
        <div className="max-w-5xl mx-auto flex justify-between items-center text-xs text-sw-gray">
          <span>StreamWatch</span>
          <span>Press F for fullscreen</span>
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
    </div>
  );
}
