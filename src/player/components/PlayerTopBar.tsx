import { Play, PanelRight, ChevronRight } from 'lucide-react';
import Tooltip from '../../components/Tooltip';

interface PlayerTopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onShowShortcuts: () => void;
}

export default function PlayerTopBar({ sidebarOpen, onToggleSidebar, onShowShortcuts }: PlayerTopBarProps) {
  const blur = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).blur();

  return (
    <div className="fixed top-2 left-2 right-2 z-20 flex items-center justify-between px-5 py-3 bg-[rgba(14,12,10,0.75)] glass border border-sw-border-soft rounded-[14px]">
      <a
        href={chrome.runtime.getURL('src/home/home.html')}
        className="font-heading font-bold text-base text-sw-text flex items-center gap-2 no-underline hover:opacity-80 transition-opacity"
      >
        <div className="w-7 h-7 bg-sw-accent rounded-md flex items-center justify-center">
          <Play size={12} fill="#f0ece8" stroke="none" />
        </div>
        StreamWatch
      </a>
      <div className="flex items-center gap-2">
        <Tooltip text="Shortcuts" shortcut="?">
          <button onClick={(e) => { onShowShortcuts(); blur(e); }} className="btn-icon w-9 h-9 bg-[rgba(30,26,23,0.6)] border-sw-border-soft font-heading text-[15px] font-semibold">?</button>
        </Tooltip>
        <Tooltip text="Sidebar">
          <button onClick={(e) => { onToggleSidebar(); blur(e); }} className="btn-icon w-9 h-9 bg-[rgba(30,26,23,0.6)] border-sw-border-soft">
            {sidebarOpen ? <ChevronRight size={17} /> : <PanelRight size={17} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
