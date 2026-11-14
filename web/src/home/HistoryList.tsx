// Web version of ../src/home/components/HistoryView.tsx. Rows stay rows on phones; the remove
// button is always visible on touch (it only appears on hover with a mouse).
import { useMemo, useState } from 'react';
import { Play, Trash2, Clock, Check } from 'lucide-react';
import type { HistoryEntry } from '@/lib/library';
import { formatTime } from '@/lib/utils';
import { formatRemaining } from '@/home/components/HistoryView';

interface HistoryListProps {
  entries: HistoryEntry[];
  isLoading: boolean;
  /** More entries may exist on the server */
  canLoadMore: boolean;
  onLoadMore: () => void;
  onPlay: (url: string) => void;
  onRemove: (entry: HistoryEntry) => Promise<void>;
  filtered: boolean;
  /** Artwork to use when the entry itself has none stored (e.g. its series' image) */
  fallbackArtwork?: (entry: HistoryEntry) => string | undefined;
}

function dayLabel(ms: number): string {
  if (!ms) return 'Earlier';
  const date = new Date(ms);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (ms >= startOfToday) return 'Today';
  if (ms >= startOfToday - dayMs) return 'Yesterday';
  if (ms >= startOfToday - 6 * dayMs) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function timeOfDay(ms: number): string {
  return ms ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

export default function HistoryList({ entries, isLoading, canLoadMore, onLoadMore, onPlay, onRemove, filtered, fallbackArtwork }: HistoryListProps) {
  const [removing, setRemoving] = useState<string | null>(null);

  // consecutive entries of the same day share one heading
  const groups = useMemo(() => {
    const result: Array<{ label: string; items: HistoryEntry[] }> = [];
    for (const entry of entries) {
      const label = dayLabel(entry.lastWatched);
      const last = result[result.length - 1];
      if (last && last.label === label) last.items.push(entry);
      else result.push({ label, items: [entry] });
    }
    return result;
  }, [entries]);

  if (isLoading && entries.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[76px] max-md:h-[68px] rounded-xl skeleton" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-20 max-md:py-14 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-5 bg-sw-elevated rounded-full flex items-center justify-center">
          <Clock size={28} className="text-sw-text-muted" />
        </div>
        <h3 className="font-heading text-xl font-bold mb-1.5 text-sw-text">
          {filtered ? 'Nothing matches your search' : 'No watch history yet'}
        </h3>
        <p className="text-sw-text-muted text-sm font-body">
          {filtered ? 'Try a different title.' : 'Everything you play shows up here.'}
        </p>
      </div>
    );
  }

  const remove = async (entry: HistoryEntry) => {
    setRemoving(entry.key);
    try {
      await onRemove(entry);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-7 max-md:space-y-6">
      {groups.map((group, gi) => (
        <section key={`${group.label}-${gi}`} className="animate-fade-up" style={{ animationDelay: `${Math.min(gi, 6) * 50}ms` }}>
          <h4 className="font-heading text-xs font-semibold text-sw-text-muted uppercase tracking-[1.5px] mb-2.5">
            {group.label}
          </h4>
          <div className="space-y-1.5 max-md:space-y-1">
            {group.items.map((entry) => {
              const { video } = entry;
              const remaining = formatRemaining(video.duration, video.progress);
              const artwork = video.backdropUrl || video.posterUrl || fallbackArtwork?.(entry);
              const time = timeOfDay(entry.lastWatched);
              return (
                <div
                  key={entry.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPlay(video.url)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onPlay(video.url); }}
                  className={`history-row group max-md:gap-3 max-md:pr-1 [@media(hover:none)]:active:bg-sw-surface ${removing === entry.key ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  {/* thumbnail */}
                  <div className="relative w-[104px] h-[58px] max-md:w-[92px] max-md:h-[52px] rounded-lg overflow-hidden bg-sw-elevated flex-shrink-0">
                    {artwork ? (
                      <img
                        src={artwork.replace('/t/p/w1280/', '/t/p/w300/')}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play size={16} className="text-sw-text-muted" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-200 [@media(hover:none)]:hidden">
                      <Play size={18} fill="#f0ece8" stroke="none" />
                    </div>
                    {video.progressPercent > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/15">
                        <div className="h-full bg-sw-accent" style={{ width: `${Math.min(100, video.progressPercent)}%` }} />
                      </div>
                    )}
                  </div>

                  {/* text */}
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-sm font-semibold text-sw-text truncate">
                      {entry.title}
                      {entry.subtitle && <span className="font-body font-normal text-sw-text-secondary"> · {entry.subtitle}</span>}
                    </p>
                    <p className="font-body text-xs text-sw-text-muted mt-1 truncate">
                      {entry.finished ? (
                        <span className="text-green-400 inline-flex items-center gap-1 align-[-2px]"><Check size={12} /> Watched</span>
                      ) : (
                        <span>{video.progressPercent}% watched{remaining ? ` · ${remaining}` : ''}</span>
                      )}
                      {video.duration > 0 && <span> · {formatTime(video.duration)}</span>}
                      {/* phones: the time column is replaced by the remove button */}
                      {time && <span className="hidden max-md:inline [@media(hover:none)]:inline"> · {time}</span>}
                    </p>
                  </div>

                  {/* time + remove */}
                  <span className="font-body text-xs text-sw-text-muted flex-shrink-0 tabular-nums group-hover:hidden max-md:hidden [@media(hover:none)]:hidden">
                    {time}
                  </span>
                  <button
                    type="button"
                    title="Remove from history"
                    aria-label={`Remove ${entry.title} from history`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(entry);
                    }}
                    className="hidden group-hover:flex w-8 h-8 rounded-lg items-center justify-center text-sw-text-muted hover:text-red-400 hover:bg-red-500/15 transition-colors flex-shrink-0 max-md:flex [@media(hover:none)]:flex [@media(hover:none)]:w-11 [@media(hover:none)]:h-11 active:text-red-400"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {canLoadMore && (
        <div className="text-center pt-2">
          <button onClick={onLoadMore} disabled={isLoading} className="btn-secondary disabled:opacity-50 max-md:w-full max-md:min-h-[44px]">
            {isLoading ? 'Loading…' : 'Load older history'}
          </button>
        </div>
      )}
    </div>
  );
}
