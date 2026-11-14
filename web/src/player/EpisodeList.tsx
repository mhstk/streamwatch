// Touch version of the series sidebar's content: season switcher + episodes.
// Used inline below the video (portrait) and inside a bottom sheet (landscape).
import { useEffect, useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import type { Episode, Series } from '@/types';
import { formatTime } from '@/lib/utils';
import { episodeLabel } from '@/lib/library';
import { PlayIcon } from './icons';

interface EpisodeListProps {
  series: Series;
  currentEpisodeIndex: number;
  currentVideoUrl: string;
  onEpisodeSelect: (episode: Episode) => void;
  onDeleteSeries: (seriesId: string) => Promise<void>;
}

export default function EpisodeList({ series, currentEpisodeIndex, currentVideoUrl, onEpisodeSelect, onDeleteSeries }: EpisodeListProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // same grouping as the extension's SeriesSidebar
  const seasonGroups = useMemo(() => {
    const groups = new Map<number, Episode[]>();
    series.episodes.forEach((ep) => {
      const season = ep.season ?? 1;
      if (!groups.has(season)) groups.set(season, []);
      groups.get(season)!.push(ep);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([season, episodes]) => {
        const sorted = [...episodes].sort((a, b) => (a.episodeNumber ?? a.index) - (b.episodeNumber ?? b.index));
        return { season, episodes: sorted, watchedCount: sorted.filter((ep) => ep.completed).length };
      });
  }, [series.episodes]);

  const currentEpisode = series.episodes.find((ep) => ep.url === currentVideoUrl) ?? series.episodes[currentEpisodeIndex];
  const currentSeason = currentEpisode?.season ?? 1;
  const [season, setSeason] = useState<number>(currentSeason);
  useEffect(() => setSeason(currentSeason), [currentSeason]);

  const group = seasonGroups.find((g) => g.season === season) ?? seasonGroups[0];

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-[17px] font-semibold text-sw-text truncate">{series.name}</h2>
          <p className="font-body text-xs text-sw-text-muted">
            {seasonGroups.length} season{seasonGroups.length !== 1 ? 's' : ''} • {series.episodes.length} episodes
          </p>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-11 h-11 -mr-2 -mt-1 flex items-center justify-center rounded-lg text-sw-text-muted active:bg-red-500/20 active:text-red-500 flex-shrink-0"
          aria-label="Delete series"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="font-body text-sm text-red-400 mb-3">
            Delete "{series.name}"? This will remove the series and all episode tracking. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="flex-1 min-h-[44px] py-2 px-3 bg-sw-border text-sw-text text-sm rounded-lg transition-colors disabled:opacity-50 font-body"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await onDeleteSeries(series.id);
                } finally {
                  setIsDeleting(false);
                  setShowDeleteConfirm(false);
                }
              }}
              disabled={isDeleting}
              className="flex-1 min-h-[44px] py-2 px-3 bg-red-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-body"
            >
              {isDeleting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </>
              ) : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {seasonGroups.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mt-3 -mx-1 px-1" role="tablist">
          {seasonGroups.map((g) => (
            <button
              key={g.season}
              role="tab"
              aria-selected={g.season === season}
              onClick={() => setSeason(g.season)}
              className={`nav-tab min-h-[44px] whitespace-nowrap flex-shrink-0 ${g.season === season ? 'nav-tab-active' : ''}`}
            >
              Season {g.season}
              {g.watchedCount > 0 && g.watchedCount === g.episodes.length && (
                <Check size={13} className="inline ml-1.5 -mt-0.5 text-green-400" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 -mx-2">
        {group?.episodes.map((episode) => {
          const isPlaying = currentVideoUrl ? episode.url === currentVideoUrl : episode.index === currentEpisodeIndex;
          const progress = episode.progress && episode.duration ? Math.round((episode.progress / episode.duration) * 100) : 0;
          const displayNumber = episode.episodeNumber ?? episode.index + 1;
          return (
            <button
              key={`${episode.url}-${episode.index}`}
              onClick={() => { if (!isPlaying) onEpisodeSelect(episode); }}
              aria-current={isPlaying ? 'true' : undefined}
              className={`w-full min-h-[56px] flex items-center gap-3 px-4 py-2.5 rounded-r-lg border-l-[3px] text-left transition-colors duration-150 ${
                isPlaying
                  ? 'bg-[rgba(30,26,23,0.7)] !border-l-sw-accent'
                  : episode.completed
                  ? 'border-transparent opacity-50 active:opacity-80'
                  : 'border-transparent active:bg-[rgba(30,26,23,0.5)]'
              }`}
            >
              <span className={`font-heading text-sm font-semibold min-w-[24px] ${isPlaying ? 'text-sw-accent' : 'text-sw-text-muted'}`}>
                {displayNumber}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-medium text-sw-text truncate">{episodeLabel(episode)}</p>
                <div className="flex items-center gap-2 mt-0.5 font-body text-[11px] text-sw-text-muted">
                  {isPlaying && <span className="text-sw-accent font-medium">Now playing</span>}
                  {episode.duration ? <span>{formatTime(episode.duration)}</span> : null}
                  {episode.completed ? (
                    <span className="text-green-400 flex items-center gap-1"><Check size={13} className="text-green-400" />Watched</span>
                  ) : progress > 0 ? (
                    <span className="text-sw-accent">{progress}%</span>
                  ) : null}
                </div>
                {!episode.completed && progress > 0 && (
                  <div className="mt-1.5 h-0.5 bg-sw-border rounded-sm overflow-hidden">
                    <div className="h-full bg-sw-accent rounded-sm" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
              {!isPlaying && <PlayIcon className="w-4 h-4 text-sw-text-muted flex-shrink-0" />}
            </button>
          );
        })}
        {(!group || group.episodes.length === 0) && (
          <p className="text-center py-6 font-body text-sm text-sw-text-muted">No episodes in this series</p>
        )}
      </div>
    </div>
  );
}
