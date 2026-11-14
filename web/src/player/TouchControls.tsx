// Overlay controls for phones and tablets: back + options on top, -10 / play / +10 in the
// centre, time + fullscreen and a thick draggable seek bar at the bottom.
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ListVideo, Subtitles } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { ExitFullscreenIcon, FullscreenIcon, PauseIcon, PlayIcon, SeekBackIcon, SeekForwardIcon } from './icons';

/* ---------------- seek bar ---------------- */

interface SeekBarProps {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  onSeek: (time: number) => void;
  onDragChange: (dragging: boolean) => void;
}

/** 44px touch area; shows the target time while dragging and seeks on release. */
export function SeekBar({ currentTime, duration, bufferedEnd, onSeek, onDragChange }: SeekBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragPct, setDragPct] = useState<number | null>(null);

  const pctAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!(duration > 0)) return;
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setDragPct(pctAt(e.clientX));
    onDragChange(true);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPct === null) return;
    setDragPct(pctAt(e.clientX));
  };
  const finish = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    if (dragPct === null) return;
    const pct = pctAt(e.clientX);
    setDragPct(null);
    onDragChange(false);
    if (commit && duration > 0) onSeek(pct * duration);
  };

  const shownPct = dragPct !== null ? dragPct * 100 : duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
  const dragging = dragPct !== null;

  return (
    <div
      ref={ref}
      className="player-seekbar relative w-full h-11 flex items-center cursor-pointer"
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={formatTime(currentTime)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
    >
      <div className={`relative w-full rounded-full bg-white/20 transition-[height] duration-150 ${dragging ? 'h-2' : 'h-1'}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${bufferedPct}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-sw-red" style={{ width: `${shownPct}%` }} />
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-sw-red shadow-md transition-[width,height] duration-150 ${dragging ? 'w-[18px] h-[18px]' : 'w-3.5 h-3.5'}`}
          style={{ left: `${shownPct}%` }}
        />
      </div>
      {dragging && (
        <div
          className="absolute bottom-full mb-1 -translate-x-1/2 px-2 py-1 rounded-md bg-black/80 text-white text-xs font-mono tabular-nums pointer-events-none whitespace-nowrap"
          style={{ left: `clamp(28px, ${shownPct}%, calc(100% - 28px))` }}
        >
          {formatTime((dragPct ?? 0) * duration)}
        </div>
      )}
    </div>
  );
}

/* ---------------- controls ---------------- */

const iconBtn = 'w-11 h-11 flex items-center justify-center text-white active:text-sw-accent transition-colors flex-shrink-0';

interface TouchControlsProps {
  layout: 'portrait' | 'landscape';
  visible: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  speed: number;
  isFullscreen: boolean;
  title: string;
  detail: string;
  /** landscape: capsule actions for a signed-in user (rendered top-right) */
  capsule?: ReactNode;
  onBack: () => void;
  onTogglePlay: () => void;
  onSeekBy: (seconds: number) => void;
  onSeekTo: (time: number) => void;
  onSubtitles: () => void;
  onSpeed: () => void;
  onEpisodes?: () => void;
  onFullscreen: () => void;
  /** true while a finger is on the controls (they must not hide) */
  onInteracting: (active: boolean) => void;
}

export default function TouchControls(p: TouchControlsProps) {
  const landscape = p.layout === 'landscape';
  const speedLabel = `${Number(p.speed.toFixed(2))}x`;

  return (
    <div
      className={`absolute inset-0 z-20 transition-[opacity,visibility] duration-300 ${p.visible ? 'opacity-100 visible' : 'opacity-0 invisible'} pointer-events-none`}
      onPointerDownCapture={() => p.onInteracting(true)}
      onPointerUpCapture={() => p.onInteracting(false)}
      onPointerCancelCapture={() => p.onInteracting(false)}
    >
      {/* scrim */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/80" />

      {/* top row */}
      <div className={`absolute top-0 left-0 right-0 flex items-center gap-1 ${landscape ? 'player-ctl-x player-ctl-top' : 'px-1 pt-1'}`}>
        <button className={`${iconBtn} pointer-events-auto`} onClick={p.onBack} aria-label="Back to home">
          <ChevronLeft size={26} />
        </button>
        <div className="flex-1 min-w-0">
          {landscape && (
            <>
              <p className="font-heading text-white font-semibold text-base leading-tight truncate drop-shadow">{p.title}</p>
              {p.detail && <p className="font-body text-white/75 text-xs truncate">{p.detail}</p>}
            </>
          )}
        </div>
        {!(landscape && p.capsule) && (
          <button className={`${iconBtn} pointer-events-auto`} onClick={p.onSubtitles} aria-label="Subtitles">
            <Subtitles size={22} />
          </button>
        )}
        <button className={`${iconBtn} pointer-events-auto font-body text-sm font-semibold tabular-nums`} onClick={p.onSpeed} aria-label={`Playback speed ${speedLabel}`}>
          {speedLabel}
        </button>
        {p.onEpisodes && (
          <button className={`${iconBtn} pointer-events-auto`} onClick={p.onEpisodes} aria-label="Episodes">
            <ListVideo size={22} />
          </button>
        )}
        {landscape && p.capsule && <div className="pointer-events-auto ml-1">{p.capsule}</div>}
      </div>

      {/* centre */}
      <div className={`absolute inset-0 flex items-center justify-center ${landscape ? 'gap-12' : 'gap-8'}`}>
        <button className="w-12 h-12 flex items-center justify-center text-white active:text-sw-accent relative pointer-events-auto" onClick={() => p.onSeekBy(-10)} aria-label="Back 10 seconds">
          <SeekBackIcon className="w-8 h-8" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[35%] text-[9px] font-bold">10</span>
        </button>
        <button
          className={`${landscape ? 'w-16 h-16' : 'w-14 h-14'} bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm text-white active:scale-95 transition-transform pointer-events-auto`}
          onClick={p.onTogglePlay}
          aria-label={p.isPlaying ? 'Pause' : 'Play'}
        >
          {p.isPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8 ml-1" />}
        </button>
        <button className="w-12 h-12 flex items-center justify-center text-white active:text-sw-accent relative pointer-events-auto" onClick={() => p.onSeekBy(10)} aria-label="Forward 10 seconds">
          <SeekForwardIcon className="w-8 h-8" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[35%] text-[9px] font-bold">10</span>
        </button>
      </div>

      {/* bottom */}
      <div className={`absolute bottom-0 left-0 right-0 ${landscape ? 'player-ctl-x player-ctl-bottom' : 'px-3'}`}>
        <div className="flex items-center justify-between h-10">
          <span className="text-white text-xs font-mono tabular-nums drop-shadow pl-1">
            {formatTime(p.currentTime)} / {formatTime(p.duration)}
          </span>
          <button className={`${iconBtn} -mr-2 pointer-events-auto`} onClick={p.onFullscreen} aria-label={p.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {p.isFullscreen ? <ExitFullscreenIcon className="w-6 h-6" /> : <FullscreenIcon className="w-6 h-6" />}
          </button>
        </div>
        <div className="pointer-events-auto">
          <SeekBar
            currentTime={p.currentTime}
            duration={p.duration}
            bufferedEnd={p.bufferedEnd}
            onSeek={p.onSeekTo}
            onDragChange={(d) => p.onInteracting(d)}
          />
        </div>
      </div>
    </div>
  );
}
