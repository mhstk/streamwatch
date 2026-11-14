// "Play a link": the extension starts videos from the right-click menu / toolbar popup; on the web
// pasting a link here is the way to start something new. Small dialog on desktop, bottom sheet on phones.
import { useState, type FormEvent } from 'react';
import { Link2, X, Play } from 'lucide-react';
import { useEscape } from './hooks';

interface PlayLinkDialogProps {
  variant: 'modal' | 'sheet';
  onClose: () => void;
  onPlay: (url: string) => void;
}

/** The link as a normalised http(s) URL, or null if it is not one. */
export function parseVideoLink(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

export default function PlayLinkDialog({ variant, onClose, onPlay }: PlayLinkDialogProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEscape(true, onClose);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = parseVideoLink(value);
    if (!url) {
      setError(value.trim() ? 'That is not a web link. It should start with http:// or https://' : 'Paste a video link first.');
      return;
    }
    onPlay(url);
  };

  const body = (
    <form onSubmit={submit} noValidate>
      <label htmlFor="sw-play-link" className="block font-body text-sm text-sw-text-secondary mb-2">
        Paste the address of a video file (.mkv, .mp4, ...)
      </label>
      <input
        id="sw-play-link"
        type="url"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        enterKeyHint="go"
        placeholder="https://example.com/video.mkv"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        aria-invalid={!!error}
        aria-describedby={error ? 'sw-play-link-error' : undefined}
        className={`input w-full max-lg:min-h-[44px] ${error ? 'border-red-500/70' : ''}`}
      />
      {error && (
        <p id="sw-play-link-error" className="text-xs text-red-400 mt-2">
          {error}
        </p>
      )}
      <div className="flex gap-2.5 mt-5 max-lg:flex-col-reverse">
        <button type="button" onClick={onClose} className="btn-secondary lg:ml-auto max-lg:min-h-[44px] max-lg:w-full">
          Cancel
        </button>
        <button type="submit" className="btn-primary flex items-center justify-center gap-2 max-lg:min-h-[44px] max-lg:w-full">
          <Play size={15} fill="#f0ece8" stroke="none" />
          Play
        </button>
      </div>
    </form>
  );

  const header = (
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg bg-sw-accent/15 text-sw-accent flex items-center justify-center flex-shrink-0">
        <Link2 size={17} />
      </span>
      <h2 className="flex-1 font-heading text-base font-semibold text-sw-text">Play a link</h2>
      <button
        type="button"
        onClick={onClose}
        className={`btn-icon flex-shrink-0 ${variant === 'sheet' ? 'w-11 h-11' : 'w-8 h-8'}`}
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <>
        <div className="sheet-backdrop" onClick={onClose} />
        <div role="dialog" aria-modal="true" aria-label="Play a link" className="sheet md:max-w-[560px] md:mx-auto">
          <div className="sheet-handle" />
          <div className="px-4 pt-2 pb-5 space-y-4">
            {header}
            {body}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 glass animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Play a link"
          className="bg-sw-bg border border-sw-border-soft rounded-2xl max-w-md w-full shadow-[0_24px_64px_rgba(0,0,0,0.7)] animate-scale-in pointer-events-auto mx-4"
        >
          <div className="p-5 border-b border-sw-border-soft">{header}</div>
          <div className="p-5">{body}</div>
        </div>
      </div>
    </>
  );
}
