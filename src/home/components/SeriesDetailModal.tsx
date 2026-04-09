import { useState, useMemo, useEffect } from 'react';
import { X, Play, Check, Trash2, ChevronRight } from 'lucide-react';
import { Series, Episode } from '@/types';
import { formatTime } from '@/lib/utils';
import { getPosterFromFilename } from '@/lib/tmdb';

interface SeasonGroup {
  season: number;
  episodes: Episode[];
  watchedCount: number;
  totalDuration: number;
}

interface SeriesDetailModalProps {
  series: Series | null;
  isOpen: boolean;
  onClose: () => void;
  onEpisodeSelect: (episode: Episode) => void;
  onDeleteSeries?: (seriesId: string) => Promise<void>;
}

export default function SeriesDetailModal({
  series,
  isOpen,
  onClose,
  onEpisodeSelect,
  onDeleteSeries,
}: SeriesDetailModalProps) {
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [_poster, setPoster] = useState<string | null>(null);

  // Reset state when modal opens/closes or series changes
  useEffect(() => {
    if (isOpen && series) {
      setSelectedSeason(null);
      setShowDeleteConfirm(false);
      setHoveredIndex(null);
    }
  }, [isOpen, series?.id]);

  // Fetch poster
  useEffect(() => {
    if (!series) {
      setPoster(null);
      return;
    }

    let cancelled = false;
    const fetchPoster = async () => {
      try {
        const result = await getPosterFromFilename(series.name);
        if (!cancelled) setPoster(result.large || result.medium);
      } catch {
        // Ignore errors
      }
    };

    fetchPoster();
    return () => { cancelled = true; };
  }, [series?.name]);

  // Group episodes by season
  const seasonGroups = useMemo((): SeasonGroup[] => {
    if (!series) return [];

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
  }, [series?.episodes]);

  const seasonCount = seasonGroups.length;

  // Auto-select season if only one exists
  useEffect(() => {
    if (isOpen && series && seasonCount === 1 && selectedSeason === null) {
      setSelectedSeason(seasonGroups[0].season);
    }
  }, [isOpen, series, seasonCount, seasonGroups, selectedSeason]);

  // Get episodes for selected season
  const selectedSeasonGroup = selectedSeason !== null
    ? seasonGroups.find(g => g.season === selectedSeason)
    : null;

  // Overall stats
  const overallStats = useMemo(() => {
    if (!series) return { watched: 0, total: 0, percent: 0 };
    const watched = series.episodes.filter(ep => ep.completed).length;
    const total = series.episodes.length;
    return {
      watched,
      total,
      percent: total > 0 ? Math.round((watched / total) * 100) : 0,
    };
  }, [series?.episodes]);

  if (!isOpen || !series) return null;

  const handleBackToSeasons = () => {
    setSelectedSeason(null);
  };

  const handleSelectSeason = (season: number) => {
    setSelectedSeason(season);
  };

  const handleEpisodeClick = (episode: Episode) => {
    onEpisodeSelect(episode);
  };

  const handleDelete = async () => {
    if (!onDeleteSeries) return;
    setIsDeleting(true);
    try {
      await onDeleteSeries(series.id);
      onClose();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 glass"
        onClick={onClose}
      />

      {/* Modal Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          className="bg-sw-bg border border-sw-border-soft rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.7)] animate-scale-in pointer-events-auto mx-4 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 border-b border-sw-border-soft flex items-center justify-between flex-shrink-0">
            <div className="flex-1 min-w-0">
              {/* Back button when viewing a season */}
              {selectedSeason !== null && seasonCount > 1 && (
                <button
                  onClick={handleBackToSeasons}
                  className="flex items-center gap-1 text-sw-text-muted hover:text-sw-text mb-1 transition-colors text-xs"
                >
                  <ChevronRight size={12} className="rotate-180" />
                  All Seasons
                </button>
              )}
              <h1 className="font-heading text-base font-semibold text-sw-text truncate">
                {selectedSeason !== null
                  ? `${series.name} — Season ${selectedSeason}`
                  : series.name}
              </h1>
              <p className="text-xs text-sw-text-muted mt-0.5">
                {selectedSeason !== null
                  ? `${selectedSeasonGroup?.episodes.length || 0} episodes`
                  : `${seasonCount} season${seasonCount !== 1 ? 's' : ''} · ${series.episodes.length} episodes`}
              </p>
            </div>
            <button onClick={onClose} className="btn-icon w-8 h-8 ml-3 flex-shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Delete confirmation banner */}
          {showDeleteConfirm && (
            <div className="px-5 py-4 bg-red-500/10 border-b border-red-900/40 flex-shrink-0">
              <p className="text-sm text-red-400 mb-3">
                Delete "{series.name}"? This will remove the series and all episode tracking. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="btn-secondary flex-1 py-2 text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2 px-4 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {selectedSeason === null ? (
              /* Seasons List View */
              <div className="grid gap-2.5 sm:grid-cols-2">
                {seasonGroups.map(({ season, episodes: seasonEpisodes, watchedCount, totalDuration }) => {
                  const progress = seasonEpisodes.length > 0
                    ? Math.round((watchedCount / seasonEpisodes.length) * 100)
                    : 0;

                  return (
                    <button
                      key={season}
                      onClick={() => handleSelectSeason(season)}
                      className="p-4 bg-sw-surface hover:bg-sw-elevated border border-sw-border rounded-xl text-left transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <span className="font-heading text-base font-semibold text-sw-text">
                            Season {season}
                          </span>
                          <div className="flex items-center gap-3 mt-1 text-xs text-sw-text-muted">
                            <span>{seasonEpisodes.length} episode{seasonEpisodes.length !== 1 ? 's' : ''}</span>
                            {totalDuration > 0 && (
                              <span>{formatTime(totalDuration)}</span>
                            )}
                          </div>

                          {/* Progress */}
                          <div className="mt-3">
                            {progress === 100 ? (
                              <div className="flex items-center gap-1 text-xs text-green-400">
                                <Check size={13} />
                                Completed
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center justify-between text-xs text-sw-text-muted mb-1">
                                  <span>{watchedCount} of {seasonEpisodes.length} watched</span>
                                  {progress > 0 && <span>{progress}%</span>}
                                </div>
                                <div className="h-1.5 bg-sw-border rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-sw-accent rounded-full transition-all"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <ChevronRight size={18} className="text-sw-text-muted group-hover:text-sw-text transition-colors ml-3 flex-shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Episodes List View */
              <div className="space-y-1">
                {selectedSeasonGroup?.episodes.map((episode) => {
                  const isHoveredEp = episode.index === hoveredIndex;
                  const progress = episode.progress && episode.duration
                    ? Math.round((episode.progress / episode.duration) * 100)
                    : 0;
                  const displayNumber = episode.episodeNumber ?? (episode.index + 1);

                  return (
                    <button
                      key={`${episode.url}-${episode.index}`}
                      onClick={() => handleEpisodeClick(episode)}
                      onMouseEnter={() => setHoveredIndex(episode.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className={`w-full px-3 py-3 rounded-lg text-left transition-colors duration-200 flex items-start gap-3 ${
                        episode.completed
                          ? 'opacity-60 hover:opacity-100 hover:bg-sw-surface'
                          : isHoveredEp
                          ? 'border-l-[3px] border-sw-accent bg-sw-surface pl-[9px]'
                          : 'hover:bg-sw-surface border-l-[3px] border-transparent'
                      }`}
                    >
                      {/* Episode Number / Check */}
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        episode.completed ? 'bg-green-600/20' : 'bg-sw-elevated'
                      }`}>
                        {episode.completed ? (
                          <Check size={15} className="text-green-400" />
                        ) : (
                          <span className="font-body text-sm font-medium text-sw-text">{displayNumber}</span>
                        )}
                      </div>

                      {/* Episode Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-heading text-sm font-semibold text-sw-text truncate">
                          {episode.title}
                        </p>

                        <div className="flex items-center gap-2 mt-0.5 text-xs">
                          {episode.duration ? (
                            <span className="text-sw-text-muted">{formatTime(episode.duration)}</span>
                          ) : null}

                          {episode.completed ? (
                            <span className="text-green-400">Watched</span>
                          ) : progress > 0 ? (
                            <span className="text-sw-accent">{progress}% watched</span>
                          ) : null}
                        </div>

                        {/* Progress Bar */}
                        {!episode.completed && progress > 0 && (
                          <div className="mt-1.5 h-[3px] bg-sw-border rounded-full overflow-hidden max-w-[160px]">
                            <div
                              className="h-full bg-sw-accent rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Play icon on hover */}
                      <div className={`flex-shrink-0 transition-opacity ${isHoveredEp ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="w-8 h-8 bg-sw-accent rounded-full flex items-center justify-center">
                          <Play size={13} fill="#f0ece8" stroke="none" />
                        </div>
                      </div>
                    </button>
                  );
                })}

                {(!selectedSeasonGroup || selectedSeasonGroup.episodes.length === 0) && (
                  <div className="text-center py-10 text-sw-text-muted font-body text-sm">
                    No episodes in this season
                  </div>
                )}
              </div>
            )}

            {series.episodes.length === 0 && (
              <div className="text-center py-10 text-sw-text-muted font-body text-sm">
                No episodes in this series
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-sw-border-soft flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="text-sm font-body text-sw-text-muted">
                {overallStats.percent === 100 ? (
                  <span className="text-green-400">Series completed!</span>
                ) : overallStats.watched > 0 ? (
                  <span>{overallStats.percent}% complete</span>
                ) : (
                  <span>Not started</span>
                )}
              </div>

              {onDeleteSeries && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-secondary text-red-400 border-red-900/50 flex items-center gap-1.5 py-1.5 px-3 text-xs"
                >
                  <Trash2 size={13} />
                  Delete Series
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
