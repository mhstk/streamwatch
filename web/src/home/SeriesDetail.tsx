// Web version of ../src/home/components/SeriesDetailModal.tsx.
// Desktop: the extension's centred modal (seasons list -> episodes).
// Phones/tablets: a full-height bottom sheet with a sticky header, a horizontal season switcher
// and a scrollable episode list. The parent handles body scroll lock and the Back button.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, Play, Check, Trash2, ChevronRight } from 'lucide-react';
import type { Series, Episode } from '@/types';
import { formatTime } from '@/lib/utils';
import { episodeLabel } from '@/lib/library';
import { useEscape } from './hooks';

interface SeasonGroup {
  season: number;
  episodes: Episode[];
  watchedCount: number;
  totalDuration: number;
}

interface SeriesDetailProps {
  series: Series;
  /** 'modal' on desktop, 'sheet' on phones / tablets */
  variant: 'modal' | 'sheet';
  /** Episode to resume / play next (highlighted, and its season opens first on phones) */
  nextUrl?: string;
  onClose: () => void;
  onEpisodeSelect: (episode: Episode) => void;
  onDeleteSeries?: () => Promise<void>;
}

function useSeasonGroups(series: Series): SeasonGroup[] {
  return useMemo(() => {
    const groups = new Map<number, Episode[]>();
    for (const ep of series.episodes) {
      const season = ep.season ?? 1;
      if (!groups.has(season)) groups.set(season, []);
      groups.get(season)!.push(ep);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([season, episodes]) => {
        const sorted = [...episodes].sort((a, b) => (a.episodeNumber ?? a.index) - (b.episodeNumber ?? b.index));
        return {
          season,
          episodes: sorted,
          watchedCount: sorted.filter((ep) => ep.completed).length,
          totalDuration: sorted.reduce((sum, ep) => sum + (ep.duration || 0), 0),
        };
      });
  }, [series.episodes]);
}

function episodePercent(ep: Episode): number {
  return ep.progress && ep.duration ? Math.round((ep.progress / ep.duration) * 100) : 0;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default function SeriesDetail(props: SeriesDetailProps) {
  const { series, variant, onClose } = props;
  const seasonGroups = useSeasonGroups(series);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEscape(true, onClose);

  const overall = useMemo(() => {
    const watched = series.episodes.filter((ep) => ep.completed).length;
    const total = series.episodes.length;
    return { watched, total, percent: total > 0 ? Math.round((watched / total) * 100) : 0 };
  }, [series.episodes]);

  const handleDelete = async () => {
    if (!props.onDeleteSeries) return;
    setIsDeleting(true);
    try {
      await props.onDeleteSeries();
      onClose();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const deleteConfirm = showDeleteConfirm && (
    <div className="px-5 py-4 max-lg:px-4 bg-red-500/10 border-b border-red-900/40 flex-shrink-0">
      <p className="text-sm text-red-400 mb-3">
        Delete "{series.name}"? This will remove the series and all episode tracking. This cannot be undone.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => setShowDeleteConfirm(false)}
          disabled={isDeleting}
          className="btn-secondary flex-1 py-2 text-sm disabled:opacity-50 max-lg:min-h-[44px]"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex-1 py-2 px-4 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 max-lg:min-h-[44px]"
        >
          {isDeleting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Deleting...
            </>
          ) : (
            'Delete Series'
          )}
        </button>
      </div>
    </div>
  );

  const footer = (
    <div className="px-5 py-4 max-lg:px-4 max-lg:py-3 border-t border-sw-border-soft flex-shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-body text-sw-text-muted">
          {overall.percent === 100 ? (
            <span className="text-green-400">Series completed!</span>
          ) : overall.watched > 0 ? (
            <span>{overall.percent}% complete</span>
          ) : (
            <span>Not started</span>
          )}
        </div>
        {props.onDeleteSeries && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-secondary text-red-400 border-red-900/50 flex items-center gap-1.5 py-1.5 px-3 text-xs max-lg:min-h-[44px] max-lg:px-4"
          >
            <Trash2 size={13} />
            Delete Series
          </button>
        )}
      </div>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <SeriesSheet {...props} seasonGroups={seasonGroups} overall={overall} deleteConfirm={deleteConfirm} footer={footer} />
    );
  }
  return <SeriesModal {...props} seasonGroups={seasonGroups} deleteConfirm={deleteConfirm} footer={footer} />;
}

// ---------------------------------------------------------------- desktop modal

function SeriesModal({
  series,
  onClose,
  onEpisodeSelect,
  seasonGroups,
  deleteConfirm,
  footer,
}: SeriesDetailProps & { seasonGroups: SeasonGroup[]; deleteConfirm: ReactNode; footer: ReactNode }) {
  const seasonCount = seasonGroups.length;
  const [selectedSeason, setSelectedSeason] = useState<number | null>(seasonCount === 1 ? seasonGroups[0].season : null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const selectedGroup = selectedSeason !== null ? seasonGroups.find((g) => g.season === selectedSeason) : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 glass animate-fade-in" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={series.name}
          className="bg-sw-bg border border-sw-border-soft rounded-2xl max-w-lg w-full max-h-[80dvh] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.7)] animate-scale-in pointer-events-auto mx-4 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5 border-b border-sw-border-soft flex items-center justify-between flex-shrink-0">
            <div className="flex-1 min-w-0">
              {selectedSeason !== null && seasonCount > 1 && (
                <button
                  onClick={() => setSelectedSeason(null)}
                  className="flex items-center gap-1 text-sw-text-muted hover:text-sw-text mb-1 transition-colors text-xs"
                >
                  <ChevronRight size={12} className="rotate-180" />
                  All Seasons
                </button>
              )}
              <h1 className="font-heading text-base font-semibold text-sw-text truncate">
                {selectedSeason !== null ? `${series.name} — Season ${selectedSeason}` : series.name}
              </h1>
              <p className="text-xs text-sw-text-muted mt-0.5">
                {selectedSeason !== null
                  ? `${selectedGroup?.episodes.length || 0} episodes`
                  : `${plural(seasonCount, 'season')} · ${series.episodes.length} episodes`}
              </p>
            </div>
            <button onClick={onClose} className="btn-icon w-8 h-8 ml-3 flex-shrink-0" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {deleteConfirm}

          <div className="flex-1 overflow-y-auto p-5">
            {selectedSeason === null ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {seasonGroups.map((group) => (
                  <SeasonCard key={group.season} group={group} onClick={() => setSelectedSeason(group.season)} />
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {selectedGroup?.episodes.map((episode) => {
                  const hovered = episode.index === hoveredIndex;
                  return (
                    <button
                      key={`${episode.url}-${episode.index}`}
                      onClick={() => onEpisodeSelect(episode)}
                      onMouseEnter={() => setHoveredIndex(episode.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className={`w-full px-3 py-3 rounded-lg text-left transition-colors duration-200 flex items-start gap-3 ${
                        episode.completed
                          ? 'opacity-60 hover:opacity-100 hover:bg-sw-surface'
                          : hovered
                            ? 'border-l-[3px] border-sw-accent bg-sw-surface pl-[9px]'
                            : 'hover:bg-sw-surface border-l-[3px] border-transparent'
                      }`}
                    >
                      <EpisodeBody episode={episode} />
                      <div className={`flex-shrink-0 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="w-8 h-8 bg-sw-accent rounded-full flex items-center justify-center">
                          <Play size={13} fill="#f0ece8" stroke="none" />
                        </div>
                      </div>
                    </button>
                  );
                })}
                {(!selectedGroup || selectedGroup.episodes.length === 0) && (
                  <div className="text-center py-10 text-sw-text-muted font-body text-sm">No episodes in this season</div>
                )}
              </div>
            )}
            {series.episodes.length === 0 && (
              <div className="text-center py-10 text-sw-text-muted font-body text-sm">No episodes in this series</div>
            )}
          </div>

          {footer}
        </div>
      </div>
    </>
  );
}

function SeasonCard({ group, onClick }: { group: SeasonGroup; onClick: () => void }) {
  const { season, episodes, watchedCount, totalDuration } = group;
  const progress = episodes.length > 0 ? Math.round((watchedCount / episodes.length) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className="p-4 bg-sw-surface hover:bg-sw-elevated border border-sw-border rounded-xl text-left transition-all group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <span className="font-heading text-base font-semibold text-sw-text">Season {season}</span>
          <div className="flex items-center gap-3 mt-1 text-xs text-sw-text-muted">
            <span>{plural(episodes.length, 'episode')}</span>
            {totalDuration > 0 && <span>{formatTime(totalDuration)}</span>}
          </div>
          <div className="mt-3">
            {progress === 100 ? (
              <div className="flex items-center gap-1 text-xs text-green-400">
                <Check size={13} />
                Completed
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-sw-text-muted mb-1">
                  <span>{watchedCount} of {episodes.length} watched</span>
                  {progress > 0 && <span>{progress}%</span>}
                </div>
                <div className="h-1.5 bg-sw-border rounded-full overflow-hidden">
                  <div className="h-full bg-sw-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
        <ChevronRight size={18} className="text-sw-text-muted group-hover:text-sw-text transition-colors ml-3 flex-shrink-0" />
      </div>
    </button>
  );
}

/** Number / check box + title + duration/status + progress bar (shared by both layouts) */
function EpisodeBody({ episode }: { episode: Episode }) {
  const progress = episodePercent(episode);
  const displayNumber = episode.episodeNumber ?? episode.index + 1;
  return (
    <>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${episode.completed ? 'bg-green-600/20' : 'bg-sw-elevated'}`}>
        {episode.completed ? (
          <Check size={15} className="text-green-400" />
        ) : (
          <span className="font-body text-sm font-medium text-sw-text">{displayNumber}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-heading text-sm font-semibold text-sw-text truncate">{episodeLabel(episode)}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs">
          {episode.duration ? <span className="text-sw-text-muted">{formatTime(episode.duration)}</span> : null}
          {episode.completed ? (
            <span className="text-green-400">Watched</span>
          ) : progress > 0 ? (
            <span className="text-sw-accent">{progress}% watched</span>
          ) : null}
        </div>
        {!episode.completed && progress > 0 && (
          <div className="mt-1.5 h-[3px] bg-sw-border rounded-full overflow-hidden max-w-[160px]">
            <div className="h-full bg-sw-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- phone / tablet sheet

function SeriesSheet({
  series,
  nextUrl,
  onClose,
  onEpisodeSelect,
  seasonGroups,
  overall,
  deleteConfirm,
  footer,
}: SeriesDetailProps & {
  seasonGroups: SeasonGroup[];
  overall: { watched: number; total: number; percent: number };
  deleteConfirm: ReactNode;
  footer: ReactNode;
}) {
  // opens on the season of the next episode (or the first unfinished one)
  const [selectedSeason, setSelectedSeason] = useState<number | null>(() => {
    const withNext = seasonGroups.find((g) => g.episodes.some((ep) => ep.url === nextUrl));
    return (withNext ?? seasonGroups.find((g) => g.watchedCount < g.episodes.length) ?? seasonGroups[0])?.season ?? null;
  });
  const group = seasonGroups.find((g) => g.season === selectedSeason) ?? seasonGroups[0];
  const listRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const activeChipRef = useRef<HTMLButtonElement>(null);

  // bring the next episode into view when the sheet opens; reset scroll on season change
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      // scroll only the sheet's own scrollers (scrollIntoView would also scroll the page behind)
      const list = listRef.current;
      const next = nextRef.current;
      if (list && next) list.scrollTop = Math.max(0, next.offsetTop - list.clientHeight / 2 + next.offsetHeight / 2);
      const chip = activeChipRef.current;
      const chips = chip?.parentElement;
      if (chip && chips) chips.scrollLeft = Math.max(0, chip.offsetLeft - chips.clientWidth / 2 + chip.offsetWidth / 2);
      return;
    }
    listRef.current?.scrollTo({ top: 0 });
  }, [selectedSeason]);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={series.name}
        className="sheet flex flex-col overflow-hidden h-[calc(100dvh-env(safe-area-inset-top,0px)-24px)] md:max-w-[640px] md:mx-auto"
      >
        {/* sticky header */}
        <div className="flex-shrink-0 border-b border-sw-border-soft">
          <div className="sheet-handle" />
          <div className="flex items-center gap-3 px-4 pt-1 pb-3">
            <div className="flex-1 min-w-0">
              <h1 className="font-heading text-lg font-semibold text-sw-text truncate">{series.name}</h1>
              <p className="text-xs text-sw-text-muted mt-0.5 truncate">
                {plural(seasonGroups.length, 'season')} · {plural(series.episodes.length, 'episode')}
                {overall.watched > 0 ? ` · ${overall.watched} watched` : ''}
              </p>
            </div>
            <button onClick={onClose} className="btn-icon w-11 h-11 flex-shrink-0" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {seasonGroups.length > 1 && (
            <div className="relative flex gap-1.5 overflow-x-auto scrollbar-hide px-4 pb-3" role="tablist" aria-label="Seasons">
              {seasonGroups.map((g) => {
                const active = g.season === group?.season;
                const done = g.episodes.length > 0 && g.watchedCount === g.episodes.length;
                return (
                  <button
                    key={g.season}
                    ref={active ? activeChipRef : undefined}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedSeason(g.season)}
                    className={`nav-tab ${active ? 'nav-tab-active' : ''} flex-shrink-0 h-11 flex items-center gap-1.5 whitespace-nowrap`}
                  >
                    Season {g.season}
                    {done && <Check size={13} className="text-green-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {deleteConfirm}

        {/* episodes */}
        <div ref={listRef} className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2">
          {group && (
            <p className="px-2 pt-1 pb-2 text-xs text-sw-text-muted">
              {seasonGroups.length > 1 ? `Season ${group.season} · ` : ''}
              {plural(group.episodes.length, 'episode')}
              {group.totalDuration > 0 ? ` · ${formatTime(group.totalDuration)}` : ''}
              {group.watchedCount > 0 ? ` · ${group.watchedCount} of ${group.episodes.length} watched` : ''}
            </p>
          )}
          <div className="space-y-0.5">
            {group?.episodes.map((episode) => {
              const isNext = !!nextUrl && episode.url === nextUrl;
              return (
                <button
                  key={`${episode.url}-${episode.index}`}
                  ref={isNext ? nextRef : undefined}
                  onClick={() => onEpisodeSelect(episode)}
                  className={`w-full min-h-[56px] px-3 py-2.5 rounded-lg text-left flex items-center gap-3 border-l-[3px] transition-colors active:bg-sw-surface ${
                    isNext ? 'border-sw-accent bg-sw-surface' : 'border-transparent'
                  } ${episode.completed ? 'opacity-60' : ''}`}
                >
                  <EpisodeBody episode={episode} />
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isNext ? 'bg-sw-accent' : 'bg-sw-elevated'
                    }`}
                  >
                    <Play size={13} fill="#f0ece8" stroke="none" className="ml-0.5" />
                  </div>
                </button>
              );
            })}
            {series.episodes.length === 0 && (
              <div className="text-center py-10 text-sw-text-muted font-body text-sm">No episodes in this series</div>
            )}
          </div>
        </div>

        {footer}
      </div>
    </>
  );
}
