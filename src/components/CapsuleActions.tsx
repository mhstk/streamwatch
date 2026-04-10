import { Subtitles, FolderPlus } from 'lucide-react';

interface CapsuleActionsProps {
  onSubtitles: () => void;
  onAddToSeries: () => void;
  sidebarOpen: boolean;
}

export default function CapsuleActions({ onSubtitles, onAddToSeries, sidebarOpen }: CapsuleActionsProps) {
  const blur = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).blur();

  return (
    <div
      className="fixed top-[82px] z-10 transition-[right] duration-300"
      style={{ right: sidebarOpen ? 330 : 20, transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      <div className="flex rounded-[14px] glass shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        {/* Subtitles — glass left */}
        <button
          onClick={onSubtitles}
          onMouseUp={blur}
          className="group relative w-[58px] h-[50px] flex items-center justify-center cursor-pointer transition-all duration-250 text-sw-text/70 bg-[rgba(22,18,16,0.7)] border border-[rgba(44,36,32,0.5)] border-r-0 rounded-l-[14px] outline-none hover:text-sw-text hover:bg-[rgba(42,35,32,0.9)]"
          style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          <Subtitles size={21} />
          <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-[-4px] group-hover:translate-y-0 z-50">
            <span className="glass bg-[rgba(22,18,16,0.95)] border border-sw-border rounded-md px-2.5 py-1.5 whitespace-nowrap flex items-center gap-1.5">
              <span className="text-sw-text-secondary text-[11px] font-medium font-body">Subtitles</span>
              <kbd className="bg-sw-elevated px-1.5 py-0.5 rounded text-[10px] text-sw-text-muted font-body">C</kbd>
            </span>
          </span>
        </button>
        {/* Add to Series — dark red right */}
        <button
          onClick={onAddToSeries}
          onMouseUp={blur}
          className="group relative w-[58px] h-[50px] flex items-center justify-center cursor-pointer transition-all duration-250 text-sw-text/85 bg-[rgba(153,27,27,0.65)] border border-[rgba(185,28,28,0.3)] border-l-0 rounded-r-[14px] outline-none hover:bg-[rgba(185,28,28,0.9)] hover:text-sw-text hover:shadow-[0_0_20px_rgba(185,28,28,0.3)]"
          style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          <FolderPlus size={21} />
          <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-[-4px] group-hover:translate-y-0 z-50">
            <span className="glass bg-[rgba(22,18,16,0.95)] border border-sw-border rounded-md px-2.5 py-1.5 whitespace-nowrap">
              <span className="text-sw-text-secondary text-[11px] font-medium font-body">Add to Series</span>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
