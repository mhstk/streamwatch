import { X } from 'lucide-react';
import { useEffect } from 'react';

interface KeyboardLegendProps {
  isOpen: boolean;
  onClose: () => void;
}

const sections = [
  {
    title: 'Playback',
    shortcuts: [
      { action: 'Play / Pause', keys: ['Space', 'K'] },
      { action: 'Fullscreen', keys: ['F'] },
      { action: 'Mute', keys: ['M'] },
      { action: 'Seek back 15s', keys: ['\u2190', 'J'] },
      { action: 'Seek forward 15s', keys: ['\u2192', 'L'] },
      { action: 'Volume up / down', keys: ['\u2191', '\u2193'] },
      { action: 'Jump to 0\u201390%', keys: ['0', '\u2013', '9'] },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { action: 'Frame back / forward', keys: [',', '.'] },
      { action: 'Start / End', keys: ['Home', 'End'] },
      { action: 'Next episode', keys: ['N'] },
    ],
  },
  {
    title: 'Subtitles',
    shortcuts: [
      { action: 'Toggle subtitles', keys: ['C'] },
      { action: 'Subtitle offset +/\u2212', keys: ['+', '\u2212'] },
    ],
  },
];

export default function KeyboardLegend({ isOpen, onClose }: KeyboardLegendProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 glass"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[rgba(22,18,16,0.95)] border border-sw-border-soft rounded-2xl w-[480px] max-h-[80vh] overflow-y-auto shadow-[0_24px_64px_rgba(0,0,0,0.7)] glass animate-scale-in">
        <div className="p-5 border-b border-sw-border-soft flex items-center justify-between">
          <h2 className="font-heading text-base font-semibold">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="btn-icon w-8 h-8 bg-transparent"><X size={14} /></button>
        </div>
        {sections.map((section, si) => (
          <div key={section.title}>
            {si > 0 && <div className="h-px bg-sw-border-soft mx-5" />}
            <div className="px-5 py-3.5">
              <div className="text-[10px] font-medium text-sw-accent uppercase tracking-[1.5px] mb-2.5 font-body">{section.title}</div>
              {section.shortcuts.map((s) => (
                <div key={s.action} className="flex items-center justify-between py-1.5">
                  <span className="text-[13px] text-sw-text-secondary font-body">{s.action}</span>
                  <div className="flex gap-1">
                    {s.keys.map((k) => (
                      <span key={k} className="bg-sw-surface border border-sw-border text-sw-text px-2 py-0.5 rounded-[5px] font-body text-[11px] font-medium min-w-[28px] text-center">{k}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
