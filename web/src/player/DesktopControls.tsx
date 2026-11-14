// Desktop control bar: the extension player's bar, unchanged in look and behaviour.
import { useRef, type RefObject } from 'react';
import { formatTime } from '@/lib/utils';
import {
  ExitFullscreenIcon, FullscreenIcon, NextEpisodeIcon, PauseIcon, PlayIcon, PrevEpisodeIcon,
  SeekBackIcon, SeekForwardIcon, VolumeIcon,
} from './icons';

interface DesktopControlsProps {
  videoRef: RefObject<HTMLVideoElement>;
  visible: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  hasSeries: boolean;
  hasPreviousEpisode: boolean;
  hasNextEpisode: boolean;
  onTogglePlay: () => void;
  onSeekBy: (seconds: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onFullscreen: () => void;
}

export default function DesktopControls(p: DesktopControlsProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressPercent = p.duration > 0 ? (p.currentTime / p.duration) * 100 : 0;

  return (
    <div className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-3 px-4 transition-opacity duration-300 ${p.visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Progress Bar */}
      <div
        ref={progressBarRef}
        className="group/prog w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 hover:h-3 transition-all"
        onClick={(e) => {
          const bar = progressBarRef.current;
          const video = p.videoRef.current;
          if (!bar || !video || !(video.duration > 0)) return;
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
        <button className="text-white hover:text-sw-accent transition-colors" onClick={p.onTogglePlay} aria-label={p.isPlaying ? 'Pause' : 'Play'}>
          {p.isPlaying ? <PauseIcon className="w-7 h-7" /> : <PlayIcon className="w-7 h-7" />}
        </button>

        <button className="text-white hover:text-sw-accent transition-colors relative" title="Back 15s" onClick={() => p.onSeekBy(-15)}>
          <SeekBackIcon className="w-6 h-6" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] text-[7px] font-bold">15</span>
        </button>

        <button className="text-white hover:text-sw-accent transition-colors relative" title="Forward 15s" onClick={() => p.onSeekBy(15)}>
          <SeekForwardIcon className="w-6 h-6" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] text-[7px] font-bold">15</span>
        </button>

        {p.hasSeries && (
          <>
            <button
              className={`transition-colors ${p.hasPreviousEpisode ? 'text-white hover:text-sw-accent cursor-pointer' : 'text-white/20 cursor-default'}`}
              onClick={p.hasPreviousEpisode ? p.onPrevious : undefined}
              title="Previous episode"
            >
              <PrevEpisodeIcon />
            </button>
            <button
              className={`transition-colors ${p.hasNextEpisode ? 'text-white hover:text-sw-accent cursor-pointer' : 'text-white/20 cursor-default'}`}
              onClick={p.hasNextEpisode ? p.onNext : undefined}
              title="Next episode"
            >
              <NextEpisodeIcon />
            </button>
          </>
        )}

        <span className="text-white text-sm font-mono tabular-nums">{formatTime(p.currentTime)} / {formatTime(p.duration)}</span>

        <div className="flex-1" />

        <div className="flex items-center gap-2 group/vol">
          <button className="text-white hover:text-sw-accent transition-colors" onClick={() => { const v = p.videoRef.current; if (v) v.muted = !v.muted; }} aria-label="Mute">
            <VolumeIcon level={p.isMuted || p.volume === 0 ? 'mute' : p.volume < 0.5 ? 'low' : 'high'} />
          </button>
          <input
            type="range" min="0" max="1" step="0.05" value={p.isMuted ? 0 : p.volume}
            onChange={(e) => { const val = parseFloat(e.target.value); const v = p.videoRef.current; if (v) { v.volume = val; v.muted = val === 0; } }}
            className="w-0 group-hover/vol:w-20 transition-all duration-200 accent-sw-red cursor-pointer"
            aria-label="Volume"
          />
        </div>

        <button className="text-white hover:text-sw-accent transition-colors" onClick={p.onFullscreen} aria-label={p.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {p.isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>
    </div>
  );
}
