import { useState, useEffect, useMemo } from 'react';
import { Series } from '@/types';
import { getPosterFromFilename } from '@/lib/tmdb';

interface ContinueInfo {
  season: number;
  episode: number;
  title: string;
  progressPercent: number;
}

interface SeriesCardProps {
  series: Series;
  onClick: () => void;
  onPlay?: (url: string) => void;
  continueInfo?: ContinueInfo;
  continueUrl?: string;
}

export default function SeriesCard({ series, onClick, onPlay, continueInfo, continueUrl }: SeriesCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [poster, setPoster] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate series stats
  const stats = useMemo(() => {
    const seasons = new Set(series.episodes.map(ep => ep.season ?? 1));
    const watchedCount = series.episodes.filter(ep => ep.completed).length;
    const totalDuration = series.episodes.reduce((sum, ep) => sum + (ep.duration || 0), 0);
    const progressPercent = series.episodes.length > 0
      ? Math.round((watchedCount / series.episodes.length) * 100)
      : 0;

    return {
      seasonCount: seasons.size,
      episodeCount: series.episodes.length,
      watchedCount,
      totalDuration,
      progressPercent,
    };
  }, [series.episodes]);

  // Fetch poster from first episode
  useEffect(() => {
    if (series.episodes.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const fetchPoster = async () => {
      try {
        // Use series name or first episode title
        const result = await getPosterFromFilename(series.name);
        if (cancelled) return;
        setPoster(result.medium);
      } catch {
        // Ignore errors
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchPoster();
    return () => { cancelled = true; };
  }, [series.name, series.episodes]);

  return (
    <div
      className="flex-shrink-0 w-[250px] group/card relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`relative rounded-md overflow-hidden bg-gray-800 cursor-pointer transition-all duration-300 ${
          isHovered ? 'transform scale-110 z-20 shadow-2xl' : ''
        }`}
        onClick={onClick}
      >
        {/* Thumbnail / Poster */}
        <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center overflow-hidden">
          {poster ? (
            <img
              src={poster}
              alt={series.name}
              className="w-full h-full object-cover"
            />
          ) : isLoading ? (
            <div className="w-10 h-10 border-2 border-sw-red/30 border-t-sw-red rounded-full animate-spin" />
          ) : (
            <div className="w-16 h-16 bg-sw-red/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-sw-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
            </div>
          )}

          {/* Series badge */}
          <div className="absolute top-2 left-2 bg-sw-red/90 text-white text-xs px-2 py-0.5 rounded">
            Series
          </div>

          {/* Continue badge */}
          {continueInfo && (
            <div className="absolute bottom-2 left-2 bg-black/80 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Continue S{continueInfo.season}E{continueInfo.episode}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {stats.progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
            <div
              className="h-full bg-sw-red"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>
        )}

        {/* Hover Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute bottom-0 left-0 right-0 p-3">
            {/* Play Button */}
            <div className="flex items-center gap-2 mb-2">
              <button
                className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-white/90 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPlay && continueUrl) {
                    onPlay(continueUrl);
                  } else if (series.episodes.length > 0) {
                    // Default to first episode if no continue URL
                    onPlay?.(series.episodes[0].url);
                  }
                }}
              >
                <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
              <button
                className="w-9 h-9 border-2 border-gray-400 rounded-full flex items-center justify-center hover:border-white transition-colors ml-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                title="View series details"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Info */}
            <p className="text-xs text-green-500 font-medium">
              {stats.progressPercent === 100 ? 'Completed' : `${stats.watchedCount}/${stats.episodeCount} watched`}
            </p>
            <p className="text-xs text-sw-gray mt-0.5">
              {stats.seasonCount} season{stats.seasonCount !== 1 ? 's' : ''} • {stats.episodeCount} episodes
            </p>
          </div>
        </div>
      </div>

      {/* Title (below card) */}
      <p className={`text-sm mt-2 truncate transition-opacity ${isHovered ? 'opacity-0' : 'opacity-100'}`}>
        {series.name}
      </p>
      {!isHovered && (
        <p className="text-xs text-sw-gray">
          {stats.seasonCount} season{stats.seasonCount !== 1 ? 's' : ''} • {stats.episodeCount} ep
        </p>
      )}
    </div>
  );
}
