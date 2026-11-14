// The extension's capsule action buttons (Subtitles | Add to Series) for touch layouts:
// in the page flow instead of fixed, no hover tooltips, optional text labels.
import { Subtitles, FolderPlus } from 'lucide-react';

interface TouchCapsuleProps {
  onSubtitles: () => void;
  onAddToSeries: () => void;
  /** show text next to the icons (portrait page) */
  labels?: boolean;
}

export default function TouchCapsule({ onSubtitles, onAddToSeries, labels = false }: TouchCapsuleProps) {
  const size = labels ? 'h-[50px] px-4 gap-2' : 'w-[58px] h-[50px]';
  return (
    <div className="flex rounded-[14px] glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] flex-shrink-0">
      <button
        onClick={onSubtitles}
        aria-label="Subtitles"
        className={`${size} flex items-center justify-center cursor-pointer transition-all duration-250 text-sw-text/70 bg-[rgba(22,18,16,0.7)] border border-[rgba(44,36,32,0.5)] border-r-0 rounded-l-[14px] outline-none active:text-sw-text active:bg-[rgba(42,35,32,0.9)]`}
      >
        <Subtitles size={21} />
        {labels && <span className="font-body text-sm font-medium text-sw-text/90">Subtitles</span>}
      </button>
      <button
        onClick={onAddToSeries}
        aria-label="Add to Series"
        className={`${size} flex items-center justify-center cursor-pointer transition-all duration-250 text-sw-text/85 bg-[rgba(153,27,27,0.65)] border border-sw-accent/[0.3] border-l-0 rounded-r-[14px] outline-none active:bg-sw-accent/[0.9] active:text-sw-text`}
      >
        <FolderPlus size={21} />
        {labels && <span className="font-body text-sm font-medium">Add to Series</span>}
      </button>
    </div>
  );
}
