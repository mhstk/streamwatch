// Playback speed picker for touch layouts (desktop keeps the extension's < / > keys).
import { Check } from 'lucide-react';
import Dialog from './Dialog';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface SpeedSheetProps {
  isOpen: boolean;
  speed: number;
  onSelect: (speed: number) => void;
  onClose: () => void;
}

export default function SpeedSheet({ isOpen, speed, onSelect, onClose }: SpeedSheetProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} sheet label="Playback speed">
      <div className="px-4 pb-2 pt-1">
        <h2 className="font-heading text-base font-semibold text-sw-text mb-2">Playback speed</h2>
        <div className="space-y-1">
          {SPEEDS.map((s) => {
            const active = Math.abs(s - speed) < 0.01;
            return (
              <button
                key={s}
                onClick={() => onSelect(s)}
                className={`w-full min-h-[48px] flex items-center justify-between px-3 rounded-lg font-body text-sm transition-colors ${
                  active ? 'text-sw-accent bg-sw-accent/[0.07]' : 'text-sw-text active:bg-sw-surface'
                }`}
              >
                <span>{s === 1 ? 'Normal' : `${s}x`}</span>
                {active && <Check size={16} className="text-sw-accent" />}
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
