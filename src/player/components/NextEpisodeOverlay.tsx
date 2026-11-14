import { useState, useEffect, useCallback } from 'react';
import { Episode, Series } from '@/types';
import { logger } from '@/lib/logger';
import { episodeLabel } from '@/lib/library';

interface NextEpisodeOverlayProps {
  series: Series;
  currentEpisodeIndex: number;
  isVisible: boolean;
  autoplay?: boolean;     // count down and play automatically
  autoplayDelay?: number; // seconds
  onPlayNext: () => void;
  onCancel: () => void;
  onReplay: () => void;
  sidebarOpen: boolean;
}

export default function NextEpisodeOverlay({
  series,
  currentEpisodeIndex,
  isVisible,
  autoplay = true,
  autoplayDelay = 5,
  onPlayNext,
  onCancel,
  onReplay,
  sidebarOpen,
}: NextEpisodeOverlayProps) {
  const [countdown, setCountdown] = useState(autoplayDelay);
  const [isPaused, setIsPaused] = useState(!autoplay);

  const nextEpisode: Episode | undefined = series.episodes[currentEpisodeIndex + 1];

  // Reset the countdown whenever the overlay is shown or hidden
  useEffect(() => {
    setCountdown(autoplayDelay);
    setIsPaused(!autoplay);
  }, [isVisible, autoplay, autoplayDelay]);

  // Countdown timer
  useEffect(() => {
    if (!isVisible || isPaused || !nextEpisode) return;

    if (countdown <= 0) {
      logger.info('player', 'AUTOPLAY_TRIGGERED');
      onPlayNext();
      return;
    }

    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [isVisible, isPaused, countdown, onPlayNext, nextEpisode]);

  const handlePauseToggle = useCallback(() => {
    setIsPaused((prev) => !prev);
    logger.info('player', isPaused ? 'AUTOPLAY_RESUMED' : 'AUTOPLAY_PAUSED');
  }, [isPaused]);

  if (!isVisible || !nextEpisode) return null;

  const progress = ((autoplayDelay - countdown) / autoplayDelay) * 100;

  return (
    <div
      className="absolute bottom-24 z-30 glass bg-[rgba(22,18,16,0.9)] border border-[rgba(44,36,32,0.4)] rounded-[14px] p-4 px-5 w-[280px] hover:-translate-y-1 transition-all duration-300 animate-fade-in"
      style={{ right: sidebarOpen ? 334 : 24, transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s' }}
    >
      {/* Up Next label */}
      <div className="text-[10px] font-medium text-sw-text-muted uppercase tracking-[1.5px] mb-2 font-body">Up Next</div>

      {/* Episode info */}
      <div className="mb-3">
        <p className="text-sw-text-secondary text-[11px] font-body mb-0.5 truncate">{series.name}</p>
        <h3 className="font-heading text-sm font-semibold text-sw-text truncate">
          {nextEpisode.season ? `Season ${nextEpisode.season} \u00b7 ` : ''}{episodeLabel(nextEpisode)}
        </h3>
      </div>

      {/* Timer bar */}
      <div className={`h-0.5 bg-sw-border rounded-sm mb-3 overflow-hidden ${autoplay ? '' : 'hidden'}`}>
        <div
          className="h-full bg-sw-accent rounded-sm transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPlayNext}
          className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Play Now
        </button>

        <button
          onClick={handlePauseToggle}
          className={`btn-secondary p-2 ${autoplay ? '' : 'hidden'}`}
          title={isPaused ? 'Resume countdown' : 'Pause countdown'}
        >
          {isPaused ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          )}
        </button>

        <button
          onClick={onCancel}
          className="btn-secondary p-2"
          title="Cancel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Replay Option */}
      <div className="mt-2.5 text-center">
        <button
          onClick={onReplay}
          className="inline-flex items-center gap-1.5 text-sw-text-muted hover:text-sw-text transition-colors text-[11px] font-body"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Replay
        </button>
      </div>
    </div>
  );
}
