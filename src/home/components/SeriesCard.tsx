import { useState, useEffect, useMemo } from 'react';
import { Play } from 'lucide-react';
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

export default function SeriesCard({ series, onClick, continueInfo }: SeriesCardProps) {
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
    <div className="group relative">
      <div className="card" onClick={onClick}>
        {/* Thumbnail / Poster */}
        <div className="aspect-video relative flex items-center justify-center bg-gradient-to-br from-sw-elevated to-sw-surface overflow-hidden">
          {poster ? (
            <img
              src={poster}
              alt={series.name}
              className="object-cover w-full h-full"
            />
          ) : isLoading ? (
            <div className="w-8 h-8 border-2 border-sw-accent/30 border-t-sw-accent rounded-full animate-spin" />
          ) : (
            <Play size={24} className="text-sw-text-muted transition-all duration-200 group-hover:text-sw-accent group-hover:scale-[1.15]" />
          )}

          {/* Series badge */}
          <span className="badge badge-neutral absolute top-2 left-2">Series</span>

          {/* Continue / episode badge */}
          {continueInfo && (
            <span className="badge badge-accent absolute top-2 right-2">
              S{continueInfo.season}E{continueInfo.episode}
            </span>
          )}

          {/* Progress Bar */}
          {stats.progressPercent > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-sw-border">
              <div
                className="h-full bg-sw-accent"
                style={{ width: `${stats.progressPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="p-2.5 px-3">
          <p className="font-heading text-[13px] font-semibold text-sw-text truncate">
            {series.name}
          </p>
          <p className="font-body text-[11px] text-sw-text-muted mt-0.5">
            {stats.seasonCount} season{stats.seasonCount !== 1 ? 's' : ''} · {stats.episodeCount} ep
            {continueInfo ? ` · ${continueInfo.progressPercent}%` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
