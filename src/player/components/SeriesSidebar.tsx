import { useState, useMemo, useEffect } from 'react';
import { Check } from 'lucide-react';
import { Series, Episode } from '@/types';
import { formatTime } from '@/lib/utils';

interface SeasonGroup {
  season: number;
  episodes: Episode[];
  watchedCount: number;
  totalDuration: number;
}

interface SeriesSidebarProps {
  series: Series;
  currentEpisodeIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onEpisodeSelect: (episode: Episode) => void;
  onDeleteSeries: (seriesId: string) => Promise<void>;
}

export default function SeriesSidebar({
  series,
  currentEpisodeIndex,
  isOpen,
  onClose,
  onEpisodeSelect,
  onDeleteSeries,
}: SeriesSidebarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // null = show seasons list, number = show episodes for that season
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  // Group episodes by season
  const seasonGroups = useMemo((): SeasonGroup[] => {
    const groups = new Map<number, Episode[]>();

    series.episodes.forEach(ep => {
      const season = ep.season ?? 1;
      if (!groups.has(season)) {
        groups.set(season, []);
      }
      groups.get(season)!.push(ep);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([season, episodes]) => {
        const sortedEpisodes = episodes.sort((a, b) =>
          (a.episodeNumber ?? a.index) - (b.episodeNumber ?? b.index)
        );
        return {
          season,
          episodes: sortedEpisodes,
          watchedCount: sortedEpisodes.filter(ep => ep.completed).length,
          totalDuration: sortedEpisodes.reduce((sum, ep) => sum + (ep.duration || 0), 0),
        };
      });
  }, [series.episodes]);

  // Get unique season count
  const seasonCount = seasonGroups.length;

  // Get current episode's season
  const currentEpisode = series.episodes[currentEpisodeIndex];
  const currentSeasonNumber = currentEpisode?.season ?? 1;

  // Auto-select season if only one exists, or go to current episode's season
  useEffect(() => {
    if (isOpen) {
      if (seasonCount === 1) {
        // Only one season, go directly to episodes
        setSelectedSeason(seasonGroups[0].season);
      } else {
        // Multiple seasons, show seasons list first
        setSelectedSeason(null);
      }
    }
  }, [isOpen, seasonCount, seasonGroups]);

  // Get episodes for selected season
  const selectedSeasonGroup = selectedSeason !== null
    ? seasonGroups.find(g => g.season === selectedSeason)
    : null;

  const handleBackToSeasons = () => {
    setSelectedSeason(null);
  };

  const handleSelectSeason = (season: number) => {
    setSelectedSeason(season);
  };

  return (
    <div
      className={`fixed top-[76px] right-2 bottom-2 z-[15] w-[310px] glass bg-[rgba(22,18,16,0.82)] border border-[rgba(44,36,32,0.4)] rounded-[14px] flex flex-col overflow-hidden transition-all duration-300 ${
        isOpen ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+16px)] opacity-0'
      }`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      {/* Header */}
      <div className="p-4 pt-5 border-b border-[rgba(44,36,32,0.4)]">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {/* Back button when viewing a season */}
            {selectedSeason !== null && seasonCount > 1 && (
              <button
                onClick={handleBackToSeasons}
                className="flex items-center gap-1 text-sw-text-muted hover:text-sw-text-secondary mb-1 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-xs">All Seasons</span>
              </button>
            )}
            <h2 className="font-heading text-[17px] font-semibold text-sw-text truncate">{series.name}</h2>
            <p className="font-body text-[11px] text-sw-text-muted">
              {selectedSeason !== null
                ? `Season ${selectedSeason} • ${selectedSeasonGroup?.episodes.length || 0} episodes`
                : `${seasonCount} season${seasonCount !== 1 ? 's' : ''} • ${series.episodes.length} episodes`
              }
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            {/* Delete Button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors group"
              title="Delete series"
            >
              <svg className="w-5 h-5 text-sw-text-muted group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="font-body text-sm text-red-400 mb-3">
              Delete "{series.name}"? This will remove the series and all episode tracking. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 bg-sw-border text-sw-text text-sm rounded-lg hover:bg-sw-border/80 transition-colors disabled:opacity-50 font-body"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await onDeleteSeries(series.id);
                    onClose();
                  } finally {
                    setIsDeleting(false);
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-body"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="overflow-y-auto flex-1 p-2 scrollbar-thin">
        {selectedSeason === null ? (
          /* Seasons List View */
          <div className="space-y-1">
            {seasonGroups.map(({ season, episodes: seasonEpisodes, watchedCount, totalDuration }) => {
              const isCurrentSeason = season === currentSeasonNumber;
              const progress = seasonEpisodes.length > 0
                ? Math.round((watchedCount / seasonEpisodes.length) * 100)
                : 0;

              return (
                <button
                  key={season}
                  onClick={() => handleSelectSeason(season)}
                  className={`w-full p-4 rounded-lg text-left transition-all ${
                    isCurrentSeason
                      ? 'bg-sw-accent/20 border border-sw-accent/50'
                      : 'bg-[rgba(30,26,23,0.5)] hover:bg-[rgba(30,26,23,0.8)] border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-heading text-base font-semibold text-sw-text">
                          Season {season}
                        </span>
                        {isCurrentSeason && (
                          <span className="font-body text-xs bg-sw-accent text-sw-text px-2 py-0.5 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 font-body text-[11px] text-sw-text-muted">
                        <span>{seasonEpisodes.length} episode{seasonEpisodes.length !== 1 ? 's' : ''}</span>
                        {totalDuration > 0 && (
                          <span>{formatTime(totalDuration)}</span>
                        )}
                        {watchedCount > 0 && (
                          <span className="text-green-400">
                            {watchedCount}/{seasonEpisodes.length} watched
                          </span>
                        )}
                      </div>
                      {/* Progress bar */}
                      {progress > 0 && progress < 100 && (
                        <div className="mt-2 h-0.5 bg-sw-border rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-sw-accent rounded-sm transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                      {progress === 100 && (
                        <div className="mt-2 flex items-center gap-1 font-body text-xs text-green-400">
                          <Check size={14} className="text-green-400" />
                          Completed
                        </div>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-sw-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* Episodes List View */
          <div className="space-y-0.5">
            {selectedSeasonGroup?.episodes.map((episode) => {
              const isPlaying = episode.index === currentEpisodeIndex;
              const isHovered = episode.index === hoveredIndex;
              const progress = episode.progress && episode.duration
                ? Math.round((episode.progress / episode.duration) * 100)
                : 0;
              const displayNumber = episode.episodeNumber ?? (episode.index + 1);

              return (
                <button
                  key={`${episode.url}-${episode.index}`}
                  onClick={() => onEpisodeSelect(episode)}
                  onMouseEnter={() => setHoveredIndex(episode.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={`w-full flex items-center gap-3 px-[18px] py-2.5 cursor-pointer transition-colors duration-150 border-l-[3px] text-left ${
                    isPlaying
                      ? 'bg-[rgba(30,26,23,0.5)] !border-l-[#B91C1C]'
                      : episode.completed
                      ? 'border-transparent opacity-50 hover:opacity-80'
                      : 'border-transparent hover:bg-[rgba(30,26,23,0.4)]'
                  }`}
                >
                  {/* Episode Number */}
                  <span className={`font-heading text-sm font-semibold min-w-[24px] ${
                    isPlaying ? 'text-sw-accent' : 'text-sw-text-muted'
                  }`}>
                    {displayNumber}
                  </span>

                  {/* Episode Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm font-medium text-sw-text truncate">
                      {episode.title}
                    </p>

                    {/* Meta Info */}
                    <div className="flex items-center gap-2 mt-0.5 font-body text-[11px] text-sw-text-muted">
                      {episode.duration ? (
                        <span>{formatTime(episode.duration)}</span>
                      ) : null}

                      {episode.completed ? (
                        <span className="text-green-400 flex items-center gap-1">
                          <Check size={14} className="text-green-400" />
                          Watched
                        </span>
                      ) : progress > 0 ? (
                        <span className="text-sw-accent">{progress}%</span>
                      ) : null}
                    </div>

                    {/* Progress Bar */}
                    {!episode.completed && progress > 0 && (
                      <div className="mt-1.5 h-0.5 bg-sw-border rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-sw-accent rounded-sm transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Play on hover */}
                  {isHovered && !isPlaying && (
                    <div className="flex-shrink-0">
                      <svg className="w-4 h-4 text-sw-accent" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}

            {(!selectedSeasonGroup || selectedSeasonGroup.episodes.length === 0) && (
              <div className="text-center py-8 text-sw-text-muted">
                <p className="font-body text-sm">No episodes in this season</p>
              </div>
            )}
          </div>
        )}

        {series.episodes.length === 0 && (
          <div className="text-center py-8 text-sw-text-muted">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            <p className="font-body text-sm">No episodes in this series</p>
          </div>
        )}
      </div>
    </div>
  );
}
