import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface DropdownOption {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function CustomDropdown({ options, value, onChange, className = '' }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
        className={`w-full font-body text-sm bg-sw-surface text-sw-text border rounded-[10px] px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors duration-200 outline-none ${
          isOpen ? 'border-sw-accent' : 'border-sw-border hover:border-[#3a322e]'
        }`}
      >
        <span>{selected?.label ?? 'Select...'}</span>
        <ChevronDown size={14} className={`text-sw-text-muted transition-transform duration-250 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-sw-surface border border-sw-border rounded-[10px] overflow-hidden z-50 shadow-[0_12px_32px_rgba(0,0,0,0.5)] animate-drop-in">
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`font-body text-sm px-4 py-2.5 cursor-pointer transition-colors duration-150 flex items-center justify-between ${
                opt.value === value
                  ? 'bg-[rgba(185,28,28,0.07)] text-sw-text'
                  : 'text-sw-text-secondary hover:bg-sw-elevated hover:text-sw-text'
              }`}
            >
              {opt.label}
              {opt.value === value && <Check size={14} className="text-sw-accent" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
