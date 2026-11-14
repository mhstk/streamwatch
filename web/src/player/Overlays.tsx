// Overlays drawn on the video: error screen, resume notice, compact next-episode card,
// "Tap to play", and the fading action flash. Desktop uses the extension's sizes;
// `compact` fits a 16:9 video that is only ~220px tall.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Episode, Series } from '@/types';
import { formatTime } from '@/lib/utils';
import { episodeLabel } from '@/lib/library';
import { CloseIcon, PauseIcon, PlayIcon, ReplayIcon, SeekBackIcon, SeekForwardIcon, WarningIcon } from './icons';

/* ---------------- error screen ---------------- */

interface ErrorScreenProps {
  compact: boolean;
  title: string;
  message: ReactNode;
  children: ReactNode; // buttons
}

export function ErrorScreen({ compact, title, message, children }: ErrorScreenProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-20 animate-fade-in overflow-y-auto">
      <div className={`text-center max-w-md ${compact ? 'px-4 py-3' : 'px-6'}`}>
        {!compact && (
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-sw-accent/15 flex items-center justify-center">
            <WarningIcon className="w-7 h-7 text-sw-accent" />
          </div>
        )}
        <h2 className={`font-heading font-semibold text-sw-text ${compact ? 'text-base mb-1' : 'text-xl mb-2'}`}>
          {compact && <WarningIcon className="w-4 h-4 text-sw-accent inline mr-1.5 -mt-0.5" />}
          {title}
        </h2>
        <p className={`font-body text-sw-text-secondary ${compact ? 'text-xs mb-3 leading-snug' : 'text-sm mb-5'}`}>{message}</p>
        <div className={`flex items-center justify-center flex-wrap ${compact ? 'gap-2 player-compact-buttons' : 'gap-2.5'}`}>{children}</div>
      </div>
    </div>
  );
}

/* ---------------- resume notice ---------------- */

interface ResumeNoticeProps {
  resumeTime: number;
  onStartOver: () => void;
  onDismiss: () => void;
  className: string; // position
  compact?: boolean;
}

export function ResumeNotice({ resumeTime, onStartOver, onDismiss, className, compact }: ResumeNoticeProps) {
  return (
    <div className={`z-20 animate-slide-up ${className}`}>
      <div className={`flex items-center glass bg-[rgba(22,18,16,0.9)] border border-sw-border-soft rounded-[14px] shadow-[0_8px_28px_rgba(0,0,0,0.5)] ${compact ? 'gap-2 pl-3 pr-1 py-1' : 'gap-3 pl-4 pr-2 py-2'}`}>
        <p className="font-body text-sm text-sw-text whitespace-nowrap">
          Resumed from <span className="text-sw-accent font-medium tabular-nums">{formatTime(resumeTime)}</span>
        </p>
        <button
          onClick={onStartOver}
          className={`bg-sw-surface text-sw-text rounded-lg font-medium text-xs hover:bg-sw-elevated active:scale-95 transition-all duration-200 whitespace-nowrap ${compact ? 'min-h-[36px] px-3' : 'py-1.5 px-3'}`}
        >
          Start over
        </button>
        <button
          onClick={onDismiss}
          className={`text-sw-text-muted hover:text-sw-text transition-colors flex items-center justify-center ${compact ? 'w-10 h-10' : 'p-1'}`}
          title="Dismiss"
          aria-label="Dismiss"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

/* ---------------- next episode (compact, touch) ---------------- */

interface NextEpisodeCompactProps {
  series: Series;
  currentEpisodeIndex: number;
  isVisible: boolean;
  autoplay: boolean;
  autoplayDelay: number;
  onPlayNext: () => void;
  onCancel: () => void;
  onReplay: () => void;
}

/** Same countdown behaviour as the extension's NextEpisodeOverlay, laid out to cover a small video. */
export function NextEpisodeCompact({ series, currentEpisodeIndex, isVisible, autoplay, autoplayDelay, onPlayNext, onCancel, onReplay }: NextEpisodeCompactProps) {
  const [countdown, setCountdown] = useState(autoplayDelay);
  const [isPaused, setIsPaused] = useState(!autoplay);
  const nextEpisode: Episode | undefined = series.episodes[currentEpisodeIndex + 1];

  useEffect(() => {
    setCountdown(autoplayDelay);
    setIsPaused(!autoplay);
  }, [isVisible, autoplay, autoplayDelay]);

  useEffect(() => {
    if (!isVisible || isPaused || !nextEpisode) return;
    if (countdown <= 0) {
      onPlayNext();
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [isVisible, isPaused, countdown, onPlayNext, nextEpisode]);

  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  if (!isVisible || !nextEpisode) return null;
  const progress = ((autoplayDelay - countdown) / autoplayDelay) * 100;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 animate-fade-in px-4">
      <div className="w-full max-w-[340px] glass bg-[rgba(22,18,16,0.9)] border border-[rgba(44,36,32,0.4)] rounded-[14px] px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[10px] font-medium text-sw-text-muted uppercase tracking-[1.5px] font-body">
            Up Next{autoplay && !isPaused ? ` · ${countdown}s` : ''}
          </div>
          <button onClick={onReplay} className="inline-flex items-center gap-1 text-sw-text-muted active:text-sw-text text-[11px] font-body min-h-[32px] -my-1">
            <ReplayIcon /> Replay
          </button>
        </div>
        <p className="text-sw-text-secondary text-[11px] font-body truncate">{series.name}</p>
        <h3 className="font-heading text-sm font-semibold text-sw-text truncate">
          {nextEpisode.season ? `Season ${nextEpisode.season} · ` : ''}{episodeLabel(nextEpisode)}
        </h3>
        {autoplay && (
          <div className="h-0.5 bg-sw-border rounded-sm mt-2 overflow-hidden">
            <div className="h-full bg-sw-accent rounded-sm transition-all duration-1000 ease-linear" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="flex items-center gap-2 mt-2.5">
          <button onClick={onPlayNext} className="btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium">
            <PlayIcon className="w-4 h-4" /> Play Now
          </button>
          {autoplay && (
            <button onClick={togglePause} className="btn-secondary w-11 h-11 p-0 flex items-center justify-center" aria-label={isPaused ? 'Resume countdown' : 'Pause countdown'}>
              {isPaused ? <PlayIcon className="w-4 h-4" /> : <PauseIcon className="w-4 h-4" />}
            </button>
          )}
          <button onClick={onCancel} className="btn-secondary w-11 h-11 p-0 flex items-center justify-center" aria-label="Cancel">
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- tap to play ---------------- */

export function TapToPlay({ onPlay, label }: { onPlay: () => void; label: string }) {
  return (
    <button
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/60 animate-fade-in w-full"
      onClick={(e) => { e.stopPropagation(); onPlay(); }}
    >
      <span className="w-16 h-16 bg-sw-accent rounded-full flex items-center justify-center shadow-[0_4px_24px_rgb(var(--sw-accent-rgb)/0.45)]">
        <PlayIcon className="w-8 h-8 text-white ml-1" />
      </span>
      <span className="font-body text-sm font-medium text-sw-text">{label}</span>
    </button>
  );
}

/* ---------------- action flash ---------------- */

export type FlashType = 'play' | 'pause' | 'seekBack' | 'seekForward';
export interface Flash { type: FlashType; key: number; side: 'left' | 'center' | 'right'; seconds: number }

export function ActionFlash({ flash }: { flash: Flash }) {
  const justify = flash.side === 'left' ? 'justify-start pl-[12%]' : flash.side === 'right' ? 'justify-end pr-[12%]' : 'justify-center';
  return (
    <div key={flash.key} className={`absolute inset-0 flex items-center ${justify} pointer-events-none animate-action-flash z-10`}>
      <div className="w-20 h-20 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
        {flash.type === 'play' && <PlayIcon className="w-10 h-10 text-white ml-1" />}
        {flash.type === 'pause' && <PauseIcon className="w-10 h-10 text-white" />}
        {(flash.type === 'seekBack' || flash.type === 'seekForward') && (
          <div className="relative flex items-center justify-center">
            {flash.type === 'seekBack' ? <SeekBackIcon className="w-10 h-10 text-white" /> : <SeekForwardIcon className="w-10 h-10 text-white" />}
            <span className="absolute text-white text-[10px] font-bold mt-1">{flash.seconds}</span>
          </div>
        )}
      </div>
    </div>
  );
}
