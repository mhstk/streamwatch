// The library header (web version of the one in ../src/home/Home.tsx) and the phone tab bar.
// Desktop: identical to the extension. Phones: compact row, search behind an icon that covers the
// row when open, Home/History in a fixed bottom tab bar.
import { useEffect, useRef, useState } from 'react';
import { Play, Search, X, Link2, Home as HomeIcon, Clock } from 'lucide-react';
import type { AuthUser } from '~/platform/auth';
import { Link, navigate } from '~/router';
import { useMediaQuery, WIDE_QUERY } from './hooks';

export type View = 'home' | 'history';

interface HeaderProps {
  view: View;
  user: AuthUser | null;
  isAuthLoading: boolean;
  signIn: () => void;
  logOut: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  onPlayLink: () => void;
}

const HEADER_BG = 'glass-light bg-[rgba(22,18,16,0.85)]';

function Avatar({ user }: { user: AuthUser }) {
  return user.photoURL ? (
    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
  ) : (
    <span className="text-sw-text font-bold text-sm">{user.displayName?.[0] || user.email?.[0] || 'U'}</span>
  );
}

export default function Header({ view, user, isAuthLoading, signIn, logOut, query, onQueryChange, onPlayLink }: HeaderProps) {
  const wide = useMediaQuery(WIDE_QUERY);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // close the user menu on outside press / Escape; "/" focuses search
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowUserMenu(false);
        if (document.activeElement === searchInputRef.current) {
          onQueryChange('');
          setSearchOpen(false);
          searchInputRef.current?.blur();
        }
      } else if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onQueryChange]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const expanded = searchOpen || !!query;
  const closeSearch = () => {
    onQueryChange('');
    setSearchOpen(false);
  };

  const searchInput = (
    <input
      ref={searchInputRef}
      type="search"
      enterKeyHint="search"
      value={query}
      onChange={(e) => onQueryChange(e.target.value)}
      onBlur={() => { if (!query) setSearchOpen(false); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder="Search your library"
      aria-label="Search your library"
      className="flex-1 min-w-0 bg-transparent outline-none text-sm font-body text-sw-text placeholder:text-sw-text-muted [&::-webkit-search-cancel-button]:hidden"
      tabIndex={expanded ? 0 : -1}
    />
  );

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-40 ${HEADER_BG} border-b border-sw-border pt-safe`}>
        <div className="relative max-w-[1280px] mx-auto flex items-center justify-between gap-4 max-md:gap-2 px-gutter lg:px-8 h-14 md:h-auto md:py-3 lg:py-3.5">
          <div className="flex items-center gap-6 max-lg:gap-4 min-w-0">
            <Link
              to="/"
              className="font-heading font-bold text-xl max-md:text-lg text-sw-text flex items-center gap-2.5 hover:opacity-85 transition-opacity min-w-0"
              aria-label="StreamWatch home"
            >
              <span className="bg-sw-accent rounded-lg w-8 h-8 flex items-center justify-center flex-shrink-0">
                <Play size={14} fill="#f0ece8" stroke="none" />
              </span>
              <span className="truncate max-[379px]:hidden">StreamWatch</span>
            </Link>

            <nav className="hidden md:flex gap-1">
              {(['home', 'history'] as const).map((v) => (
                <Link key={v} to={v === 'home' ? '/' : '/history'} className={`nav-tab ${view === v ? 'nav-tab-active' : ''} [@media(hover:none)]:min-h-[44px] [@media(hover:none)]:flex [@media(hover:none)]:items-center`}>
                  {v === 'home' ? 'Home' : 'History'}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 max-md:gap-2 flex-shrink-0">
            {/* Search */}
            {wide ? (
              <div
                className={`flex items-center h-[38px] [@media(hover:none)]:h-11 rounded-lg border bg-sw-surface overflow-hidden transition-all duration-300 ease-out ${
                  expanded ? 'w-56 lg:w-64 border-sw-border focus-within:border-sw-accent' : 'w-[38px] [@media(hover:none)]:w-11 border-sw-border hover:border-sw-text-secondary'
                }`}
              >
                <button
                  onClick={() => setSearchOpen(true)}
                  className="w-[36px] [@media(hover:none)]:w-[42px] h-full flex items-center justify-center text-sw-text-secondary hover:text-sw-text flex-shrink-0 transition-colors"
                  title="Search your library ( / )"
                  aria-label="Search your library"
                >
                  <Search size={16} />
                </button>
                {searchInput}
                {query && (
                  <button
                    onClick={() => { onQueryChange(''); searchInputRef.current?.focus(); }}
                    className="w-8 h-full flex items-center justify-center text-sw-text-muted hover:text-sw-text flex-shrink-0"
                    title="Clear"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => setSearchOpen(true)} className="btn-icon w-11 h-11" aria-label="Search your library">
                <Search size={18} />
              </button>
            )}

            {user && (
              <button
                onClick={onPlayLink}
                className="btn-icon max-md:w-11 max-md:h-11 [@media(hover:none)]:w-11 [@media(hover:none)]:h-11"
                title="Play a link"
                aria-label="Play a link"
              >
                <Link2 size={17} />
              </button>
            )}

            {/* User menu */}
            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="w-9 h-9 rounded-full bg-sw-elevated border-2 border-sw-border hover:border-sw-accent transition-colors cursor-pointer overflow-hidden flex items-center justify-center relative after:absolute after:-inset-1 after:content-['']"
                  aria-label="Account menu"
                  aria-expanded={showUserMenu}
                >
                  <Avatar user={user} />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 top-12 w-52 max-md:w-60 bg-sw-surface border border-sw-border rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.5)] animate-drop-in overflow-hidden">
                    <div className="p-3 border-b border-sw-border">
                      <p className="text-sm font-medium text-sw-text truncate">{user.displayName || 'User'}</p>
                      <p className="text-xs text-sw-text-muted truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { setShowUserMenu(false); navigate('/settings'); }}
                      className="w-full px-3 py-2.5 max-md:py-3 text-left text-sm text-sw-text hover:bg-sw-elevated active:bg-sw-elevated transition-colors"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); logOut(); }}
                      className="w-full px-3 py-2.5 max-md:py-3 text-left text-sm text-sw-text hover:bg-sw-elevated active:bg-sw-elevated transition-colors border-t border-sw-border"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={signIn} disabled={isAuthLoading} className="btn-primary text-sm disabled:opacity-50 max-md:px-4 max-md:min-h-[44px]">
                Sign In
              </button>
            )}
          </div>

          {/* Phones: open search covers the header row */}
          {!wide && expanded && (
            <div className={`absolute inset-0 flex items-center gap-2 px-gutter bg-sw-bg animate-fade-in`}>
              <div className="flex-1 min-w-0 flex items-center h-11 rounded-lg border border-sw-border focus-within:border-sw-accent bg-sw-surface overflow-hidden">
                <Search size={16} className="text-sw-text-secondary mx-3 flex-shrink-0" />
                {searchInput}
                {query && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onQueryChange(''); searchInputRef.current?.focus(); }}
                    className="w-10 h-full flex items-center justify-center text-sw-text-muted flex-shrink-0"
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              <button onClick={closeSearch} className="btn-ghost px-3 min-h-[44px] flex-shrink-0">
                Cancel
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Phones: Home / History tab bar */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 ${HEADER_BG} border-t border-sw-border pb-safe px-safe`} aria-label="Library">
        <div className="grid grid-cols-2 gap-2 px-4 py-1.5">
          {(['home', 'history'] as const).map((v) => {
            const Icon = v === 'home' ? HomeIcon : Clock;
            return (
              <Link
                key={v}
                to={v === 'home' ? '/' : '/history'}
                aria-current={view === v ? 'page' : undefined}
                className={`nav-tab ${view === v ? 'nav-tab-active' : ''} flex flex-col items-center justify-center gap-0.5 min-h-[48px] text-[11px] !py-1`}
              >
                <Icon size={18} />
                {v === 'home' ? 'Home' : 'History'}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
