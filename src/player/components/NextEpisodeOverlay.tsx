import { useState, useEffect, useCallback } from 'react';
import { Episode, Series } from '@/types';
import { logger } from '@/lib/logger';

interface NextEpisodeOverlayProps {
  series: Series;
  currentEpisodeIndex: number;
  isVisible: boolean;
  autoplayDelay?: number; // seconds
  onPlayNext: () => void;
  onCancel: () => void;
  onReplay: () => void;
}

export default function NextEpisodeOverlay({
  series,
  currentEpisodeIndex,
  isVisible,
  autoplayDelay = 5,
  onPlayNext,
  onCancel,
  onReplay,
}: NextEpisodeOverlayProps) {
  const [countdown, setCountdown] = useState(autoplayDelay);
  const [isPaused, setIsPaused] = useState(false);

  const nextEpisode: Episode | undefined = series.episodes[currentEpisodeIndex + 1];

  // Reset countdown when overlay becomes visible
  useEffect(() => {
    if (isVisible) {
      setCountdown(autoplayDelay);
      setIsPaused(false);
      logger.info('player', 'NEXT_EPISODE_OVERLAY_SHOWN', {
        seriesName: series.name,
        nextEpisodeIndex: currentEpisodeIndex + 1,
        nextEpisodeTitle: nextEpisode?.title,
        autoplayDelay,
      });
    }
  }, [isVisible, autoplayDelay, series.name, currentEpisodeIndex, nextEpisode?.title]);

  // Countdown timer
  useEffect(() => {
    if (!isVisible || isPaused || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          logger.info('player', 'AUTOPLAY_TRIGGERED', { nextEpisodeTitle: nextEpisode?.title });
          onPlayNext();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isVisible, isPaused, countdown, onPlayNext, nextEpisode?.title]);

  const handlePauseToggle = useCallback(() => {
    setIsPaused((prev) => !prev);
    logger.info('player', isPaused ? 'AUTOPLAY_RESUMED' : 'AUTOPLAY_PAUSED');
  }, [isPaused]);

  if (!isVisible || !nextEpisode) return null;

  const progress = ((autoplayDelay - countdown) / autoplayDelay) * 100;

  return (
    <div className="absolute inset-0 bg-black/90 z-30 flex items-center justify-center animate-fade-in">
      <div className="max-w-lg w-full mx-4">
        {/* Current Episode Completed */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 rounded-full mb-4">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-green-500 text-sm font-medium">Episode Complete</span>
          </div>
        </div>

        {/* Next Episode Card */}
        <div className="bg-gray-800/80 rounded-2xl overflow-hidden border border-gray-700/50 backdrop-blur-sm">
          {/* Thumbnail Placeholder */}
          <div className="relative aspect-video bg-gradient-to-br from-gray-700 to-gray-800">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 bg-sw-red/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>

            {/* Progress Ring Overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                {/* Circular progress */}
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="44"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="4"
                    fill="none"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="44"
                    stroke="#E50914"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 44}`}
                    strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                {/* Countdown Number */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">{countdown}</span>
                </div>
              </div>
            </div>

            {/* Episode Number Badge */}
            <div className="absolute top-3 left-3 px-3 py-1 bg-black/70 rounded-md text-sm font-medium">
              Episode {currentEpisodeIndex + 2}
            </div>
          </div>

          {/* Episode Info */}
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-sw-gray mb-2">
              <span>{series.name}</span>
              <span>•</span>
              <span>Up Next</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-4">{nextEpisode.title}</h3>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={onPlayNext}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-all active:scale-95"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Play Now
              </button>

              <button
                onClick={handlePauseToggle}
                className="p-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all active:scale-95"
                title={isPaused ? 'Resume countdown' : 'Pause countdown'}
              >
                {isPaused ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                )}
              </button>

              <button
                onClick={onCancel}
                className="p-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all active:scale-95"
                title="Cancel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Replay Option */}
        <div className="mt-4 text-center">
          <button
            onClick={onReplay}
            className="inline-flex items-center gap-2 text-sw-gray hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm">Replay current episode</span>
          </button>
        </div>
      </div>
    </div>
  );
}
