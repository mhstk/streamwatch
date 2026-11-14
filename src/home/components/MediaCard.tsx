import { useEffect, useRef, useState } from 'react';
import { Play, ListVideo, Check } from 'lucide-react';
import { searchMedia, PosterResult } from '@/lib/tmdb';

/** TMDB serves several widths; cards don't need the 1280px backdrop */
function cardSize(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace('/t/p/w1280/', '/t/p/w780/');
}

interface ArtworkOptions {
  kind: 'tv' | 'movie';
  query: string;
  year?: number;
  storedPoster?: string;
  storedBackdrop?: string;
  /** Called once when artwork had to be looked up, so the caller can store it */
  onResolved?: (result: PosterResult) => void;
}

/**
 * Landscape artwork for a card: stored backdrop/poster when available,
 * otherwise a TMDB lookup.
 */
export function useArtwork({ kind, query, year, storedPoster, storedBackdrop, onResolved }: ArtworkOptions) {
  const stored = cardSize(storedBackdrop) || storedPoster || null;
  const [image, setImage] = useState<string | null>(stored);
  const [loading, setLoading] = useState(!stored);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    if (stored) {
      setImage(stored);
      setLoading(false);
      return;
    }
    if (!query.trim()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let result = await searchMedia({ query, year, type: kind });
        // the year in a filename is sometimes off by one - retry without it
        if (!result.info && year) result = await searchMedia({ query, type: kind });
        if (cancelled) return;
        setImage(cardSize(result.backdrop) || result.medium);
        if (result.info) onResolvedRef.current?.(result);
      } catch {
        // artwork is optional
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [stored, query, year, kind]);

  return { image, loading };
}

interface MediaCardProps {
  title: string;
  subtitle?: string;
  image: string | null;
  imageLoading?: boolean;
  /** 0-100; the bar is hidden when undefined or 0 */
  progressPercent?: number;
  /** Small label over the artwork, top-left ("Series") */
  badge?: string;
  /** Accent label over the artwork, top-right ("S05E16") */
  tag?: string;
  watched?: boolean;
  /** Stagger position for the entrance animation */
  index?: number;
  onClick: () => void;
  /** Optional secondary action shown on hover (e.g. "All episodes") */
  onDetails?: () => void;
  detailsLabel?: string;
}

export default function MediaCard({
  title,
  subtitle,
  image,
  imageLoading,
  progressPercent,
  badge,
  tag,
  watched,
  index = 0,
  onClick,
  onDetails,
  detailsLabel = 'Details',
}: MediaCardProps) {
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageReady(false);
    setImageFailed(false);
  }, [image]);

  const showImage = image && !imageFailed;

  return (
    <div
      className="media-card group"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="media-card-art">
        {showImage && (
          <img
            src={image}
            alt=""
            loading="lazy"
            onLoad={() => setImageReady(true)}
            onError={() => setImageFailed(true)}
            className={`media-card-img ${imageReady ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
        {!showImage && imageLoading && <div className="absolute inset-0 skeleton" />}
        {!showImage && !imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <span className="font-heading text-sm font-semibold text-sw-text-muted text-center truncate-2">{title}</span>
          </div>
        )}

        {/* hover veil + play button */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-out">
          <div className="w-12 h-12 rounded-full bg-sw-accent/95 flex items-center justify-center shadow-[0_6px_24px_rgba(0,0,0,0.5)]">
            <Play size={18} fill="#f0ece8" stroke="none" className="ml-0.5" />
          </div>
        </div>

        {badge && <span className="badge badge-neutral absolute top-2 left-2 backdrop-blur-sm bg-[rgba(22,18,16,0.7)]">{badge}</span>}
        {tag && <span className="badge absolute top-2 right-2 bg-sw-accent text-sw-text shadow-md">{tag}</span>}
        {watched && !tag && (
          <span className="badge badge-success absolute top-2 right-2 flex items-center gap-1 backdrop-blur-sm">
            <Check size={11} /> Watched
          </span>
        )}

        {onDetails && (
          <button
            type="button"
            title={detailsLabel}
            onClick={(e) => { e.stopPropagation(); onDetails(); }}
            className="absolute bottom-2.5 right-2 w-8 h-8 rounded-lg bg-[rgba(22,18,16,0.8)] border border-sw-border text-sw-text-secondary flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 hover:text-sw-text hover:border-sw-text-secondary transition-all duration-200"
          >
            <ListVideo size={15} />
          </button>
        )}

        {progressPercent !== undefined && progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/15">
            <div className="h-full bg-sw-accent rounded-r-full" style={{ width: `${Math.min(100, progressPercent)}%` }} />
          </div>
        )}
      </div>

      <div className="p-3 pt-2.5">
        <p className="font-heading text-[13px] font-semibold text-sw-text truncate" title={title}>{title}</p>
        {subtitle && <p className="font-body text-[11px] text-sw-text-muted mt-0.5 truncate">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Placeholder shown while the library loads */
export function MediaCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden border border-sw-border bg-sw-surface">
      <div className="aspect-video skeleton" />
      <div className="p-3 pt-2.5 space-y-2">
        <div className="h-3 w-3/4 rounded skeleton" />
        <div className="h-2.5 w-1/2 rounded skeleton" />
      </div>
    </div>
  );
}
