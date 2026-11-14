// A dialog that is the extension's centred modal on desktop and a bottom sheet on touch layouts.
// Sheets lock the page scroll and close with the Back gesture.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

let sheetSeq = 0;

/** While `open`, an extra history entry makes Back (gesture or button) call onClose instead of leaving. */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = ++sheetSeq;
    let pushed = false;
    let popped = false;
    const onPop = () => {
      popped = true;
      onCloseRef.current();
    };
    // deferred so React StrictMode's mount/unmount/mount does not leave stray entries
    const timer = window.setTimeout(() => {
      window.history.pushState({ ...(window.history.state || {}), swSheet: id }, '', window.location.href);
      pushed = true;
      window.addEventListener('popstate', onPop);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
      // closed from the UI: drop our entry, unless something else navigated meanwhile
      if (pushed && !popped && window.history.state?.swSheet === id) window.history.back();
    };
  }, [open]);
}

/** True when the top history entry belongs to an open sheet (navigate with replace then). */
export function sheetEntryOnTop(): boolean {
  return !!window.history.state?.swSheet;
}

let lockCount = 0;
let savedOverflow = '';

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (lockCount++ === 0) {
      savedOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    return () => {
      if (--lockCount === 0) {
        document.documentElement.style.overflow = savedOverflow;
        document.body.style.overflow = '';
      }
    };
  }, [active]);
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** bottom sheet (touch) instead of the centred modal (desktop) */
  sheet: boolean;
  /** sheet takes the full available height (long, scrolling content) */
  tall?: boolean;
  /** extra classes for the desktop card */
  cardClassName?: string;
  label?: string;
  children: ReactNode;
}

export default function Dialog({ open, onClose, sheet, tall, cardClassName = 'max-w-lg', label, children }: DialogProps) {
  const backdropPressRef = useRef(false);
  useScrollLock(open && sheet);
  useBackToClose(open && sheet, onClose);

  if (!open) return null;

  // inside the fullscreen element when there is one, otherwise it would be invisible
  const host = (document.fullscreenElement as HTMLElement | null) || document.body;

  if (sheet) {
    return createPortal(
      <>
        <div className="sheet-backdrop" onClick={onClose} />
        <div
          className={`sheet flex flex-col ${tall ? 'player-sheet-tall' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div className="sheet-handle flex-shrink-0" />
          {children}
        </div>
      </>,
      host
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
      style={{ backdropFilter: 'blur(14px)' }}
      // close only when the press started on the backdrop, not when a text
      // selection drag ends outside the dialog
      onMouseDown={(e) => { backdropPressRef.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (backdropPressRef.current && e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`bg-[#161210] border border-[rgba(44,36,32,0.4)] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] w-full animate-scale-in max-h-[90dvh] flex flex-col ${cardClassName}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    host
  );
}
