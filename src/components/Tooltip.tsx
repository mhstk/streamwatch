import { ReactNode } from 'react';

interface TooltipProps {
  text: string;
  shortcut?: string;
  children: ReactNode;
  position?: 'bottom' | 'top';
}

export default function Tooltip({ text, shortcut, children, position = 'bottom' }: TooltipProps) {
  const posClass = position === 'bottom'
    ? 'top-full mt-2 left-1/2 -translate-x-1/2'
    : 'bottom-full mb-2 left-1/2 -translate-x-1/2';

  return (
    <div className="relative group">
      {children}
      <div className={`absolute ${posClass} pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 translate-y-[-4px] group-hover:translate-y-0`}>
        <div className="glass bg-[rgba(22,18,16,0.95)] border border-sw-border rounded-md px-2.5 py-1.5 whitespace-nowrap flex items-center gap-1.5">
          <span className="text-sw-text-secondary text-[11px] font-medium font-body">{text}</span>
          {shortcut && (
            <kbd className="bg-sw-elevated px-1.5 py-0.5 rounded text-[10px] text-sw-text-muted font-body">{shortcut}</kbd>
          )}
        </div>
      </div>
    </div>
  );
}
