import { useState, useMemo, useEffect } from 'react';
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
  const [poster, setPoster] = useState<string | null>(null);

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
        className="fixed inset-0 bg-black/80 z-50 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-8 lg:inset-16 bg-gray-900 rounded-xl z-50 overflow-hidden flex flex-col animate-scale-in">
        {/* Header with backdrop image */}
        <div className="relative h-48 md:h-64 flex-shrink-0">
          {/* Backdrop/Poster */}
          {poster ? (
            <img
              src={poster}
              alt={series.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800" />
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors z-10"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Series info */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            {/* Back button when viewing a season */}
            {selectedSeason !== null && seasonCount > 1 && (
              <button
                onClick={handleBackToSeasons}
                className="flex items-center gap-1 text-sw-gray hover:text-white mb-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm">All Seasons</span>
              </button>
            )}

            <h1 className="text-2xl md:text-3xl font-bold text-white">{series.name}</h1>
            <p className="text-sw-gray mt-1">
              {selectedSeason !== null
                ? `Season ${selectedSeason} • ${selectedSeasonGroup?.episodes.length || 0} episodes`
                : `${seasonCount} season${seasonCount !== 1 ? 's' : ''} • ${series.episodes.length} episodes`
              }
            </p>

            {/* Overall progress */}
            {selectedSeason === null && overallStats.total > 0 && (
              <div className="mt-3 max-w-xs">
                <div className="flex items-center justify-between text-xs text-sw-gray mb-1">
                  <span>{overallStats.watched} of {overallStats.total} watched</span>
                  <span>{overallStats.percent}%</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sw-red rounded-full transition-all"
                    style={{ width: `${overallStats.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delete confirmation banner */}
        {showDeleteConfirm && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/30 flex-shrink-0">
            <p className="text-sm text-red-400 mb-3">
              Delete "{series.name}"? This will remove the series and all episode tracking. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2 px-4 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
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
        <div className="flex-1 overflow-y-auto p-6">
          {selectedSeason === null ? (
            /* Seasons List View */
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {seasonGroups.map(({ season, episodes: seasonEpisodes, watchedCount, totalDuration }) => {
                const progress = seasonEpisodes.length > 0
                  ? Math.round((watchedCount / seasonEpisodes.length) * 100)
                  : 0;

                return (
                  <button
                    key={season}
                    onClick={() => handleSelectSeason(season)}
                    className="p-4 bg-gray-800/50 hover:bg-gray-800 rounded-xl text-left transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <span className="text-lg font-medium text-white">
                          Season {season}
                        </span>
                        <div className="flex items-center gap-3 mt-1 text-sm text-sw-gray">
                          <span>{seasonEpisodes.length} episode{seasonEpisodes.length !== 1 ? 's' : ''}</span>
                          {totalDuration > 0 && (
                            <span>{formatTime(totalDuration)}</span>
                          )}
                        </div>

                        {/* Progress */}
                        <div className="mt-3">
                          {progress === 100 ? (
                            <div className="flex items-center gap-1 text-sm text-green-500">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Completed
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between text-xs text-sw-gray mb-1">
                                <span>{watchedCount} of {seasonEpisodes.length} watched</span>
                                {progress > 0 && <span>{progress}%</span>}
                              </div>
                              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-sw-red rounded-full transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <svg className="w-6 h-6 text-sw-gray group-hover:text-white transition-colors ml-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Episodes List View */
            <div className="space-y-2">
              {selectedSeasonGroup?.episodes.map((episode) => {
                const isHovered = episode.index === hoveredIndex;
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
                    className={`w-full p-4 rounded-xl text-left transition-all duration-200 ${
                      isHovered ? 'bg-gray-800' : 'bg-gray-800/30 hover:bg-gray-800/60'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Episode Number */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        episode.completed ? 'bg-green-600/20' : 'bg-gray-700'
                      }`}>
                        {episode.completed ? (
                          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <span className="text-base font-medium text-white">{displayNumber}</span>
                        )}
                      </div>

                      {/* Episode Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-white truncate">
                          {episode.title}
                        </p>

                        {/* Meta Info */}
                        <div className="flex items-center gap-3 mt-1 text-sm">
                          {episode.duration ? (
                            <span className="text-sw-gray">{formatTime(episode.duration)}</span>
                          ) : null}

                          {episode.completed ? (
                            <span className="text-green-500">Watched</span>
                          ) : progress > 0 ? (
                            <span className="text-sw-red">{progress}% watched</span>
                          ) : null}
                        </div>

                        {/* Progress Bar */}
                        {!episode.completed && progress > 0 && (
                          <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden max-w-xs">
                            <div
                              className="h-full bg-sw-red rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Play icon on hover */}
                      <div className={`flex-shrink-0 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="w-10 h-10 bg-sw-red rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}

              {(!selectedSeasonGroup || selectedSeasonGroup.episodes.length === 0) && (
                <div className="text-center py-12 text-sw-gray">
                  <p>No episodes in this season</p>
                </div>
              )}
            </div>
          )}

          {series.episodes.length === 0 && (
            <div className="text-center py-12 text-sw-gray">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              <p>No episodes in this series</p>
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="p-4 border-t border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="text-sm text-sw-gray">
              {overallStats.percent === 100 ? (
                <span className="text-green-500">Series completed!</span>
              ) : overallStats.watched > 0 ? (
                <span>{overallStats.percent}% complete</span>
              ) : (
                <span>Not started</span>
              )}
            </div>

            {onDeleteSeries && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                Delete Series
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
