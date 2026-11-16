// Web version of ../src/home/components/MediaCard.tsx: same card, plus touch rules
// (no hover-only actions, no hover veil, bigger details button).
import { useState } from 'react';
import { Play, ListVideo, Check } from 'lucide-react';

interface MediaCardProps {
  title: string;
  subtitle?: string;
  image: string | null;
  imageLoading?: boolean;
  /** 0-100; the bar is hidden when undefined or 0 */
  progressPercent?: number;
  /** Accent label over the artwork, top-right ("S05E16") */
  tag?: string;
  watched?: boolean;
  /** Stagger position for the entrance animation */
  index?: number;
  onClick: () => void;
  /** Secondary action (e.g. "All episodes"): on hover with a mouse, always visible on touch */
  onDetails?: () => void;
  detailsLabel?: string;
}

export default function MediaCard({
  title,
  subtitle,
  image,
  imageLoading,
  progressPercent,
  tag,
  watched,
  index = 0,
  onClick,
  onDetails,
  detailsLabel = 'Details',
}: MediaCardProps) {
  // Which image URL has loaded / failed. Tracked per URL instead of resetting flags in an effect:
  // an effect runs after the first paint, so a picture that loads instantly from the browser's
  // cache (every visit after the first) was being marked "not ready" again and stayed invisible.
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageReady = !!image && readySrc === image;
  const imageFailed = !!image && failedSrc === image;

  const showImage = image && !imageFailed;

  return (
    <div
      className="media-card group min-w-0"
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
            // already complete when React attaches (cached): no load event will follow
            ref={(el) => { if (el && el.complete && el.naturalWidth > 0 && readySrc !== image) setReadySrc(image); }}
            onLoad={() => setReadySrc(image)}
            onError={() => setFailedSrc(image)}
            className={`media-card-img ${imageReady ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
        {!showImage && imageLoading && <div className="absolute inset-0 skeleton" />}
        {!showImage && !imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center px-3">
            <span className="font-heading text-sm font-semibold text-sw-text-muted text-center truncate-2">{title}</span>
          </div>
        )}

        {/* hover veil + play button (mouse only) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300 [@media(hover:none)]:group-hover:opacity-60" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-out [@media(hover:none)]:hidden">
          <div className="w-12 h-12 rounded-full bg-sw-accent/95 flex items-center justify-center shadow-[0_6px_24px_rgba(0,0,0,0.5)]">
            <Play size={18} fill="#f0ece8" stroke="none" className="ml-0.5" />
          </div>
        </div>

        {tag && (
          <span className="badge absolute top-2 right-2 bg-sw-accent text-sw-text shadow-md max-md:text-[11px] max-md:px-2 max-md:py-0.5">
            {tag}
          </span>
        )}
        {watched && !tag && (
          <span className="badge badge-success absolute top-2 right-2 flex items-center gap-1 backdrop-blur-sm max-md:text-[11px] max-md:px-2 max-md:py-0.5">
            <Check size={11} /> Watched
          </span>
        )}

        {onDetails && (
          <button
            type="button"
            title={detailsLabel}
            aria-label={detailsLabel}
            onClick={(e) => { e.stopPropagation(); onDetails(); }}
            className="absolute bottom-2.5 right-2 w-8 h-8 rounded-lg bg-[rgba(22,18,16,0.8)] border border-sw-border text-sw-text-secondary flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 hover:text-sw-text hover:border-sw-text-secondary transition-all duration-200 [@media(hover:none)]:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:w-10 [@media(hover:none)]:h-10 [@media(hover:none)]:bottom-1.5 [@media(hover:none)]:right-1.5 [@media(hover:none)]:text-sw-text"
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

      <div className="p-3 pt-2.5 max-md:p-2.5 max-md:pt-2">
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
