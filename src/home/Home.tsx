import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Play, Search, X, Film, ListVideo } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRecentHistory } from '@/hooks/useRecentHistory';
import { useSeries } from '@/hooks/useSeries';
import { logger } from '@/lib/logger';
import { Episode } from '@/types';
import { PosterResult } from '@/lib/tmdb';
import { updateVideoPoster } from '@/lib/firestore';
import {
  buildLibrary,
  toSeries,
  HistoryEntry,
  LibraryItem,
  LibraryMovie,
  LibrarySeries,
} from '@/lib/library';
import { formatEpisodeCode, normalizeName } from '@/lib/titleParser';
import MediaCard, { MediaCardSkeleton, useArtwork } from './components/MediaCard';
import HistoryView, { formatRemaining } from './components/HistoryView';
import SeriesDetailModal from './components/SeriesDetailModal';

type View = 'home' | 'history';

/** How many history records to load at a time */
const HISTORY_PAGE = 300;

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4';

function viewFromHash(): View {
  return window.location.hash === '#history' ? 'history' : 'home';
}

function playUrl(url: string): void {
  window.location.href = chrome.runtime.getURL(`index.html?url=${encodeURIComponent(url)}`);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Store artwork that had to be looked up, so the next visit is instant */
function useSaveArtwork(userId: string | undefined) {
  return useCallback(
    (historyId: string | undefined, result: PosterResult) => {
      if (!userId || !historyId || !result.info) return;
      updateVideoPoster(userId, historyId, {
        posterUrl: result.medium || undefined,
        backdropUrl: result.backdrop || undefined,
        mediaTitle: result.info.title,
        mediaYear: result.info.year,
        mediaType: result.info.type,
        mediaRating: result.info.rating,
        mediaOverview: result.info.overview,
      }).catch((err) => logger.error('home', 'Failed to save artwork', err));
    },
    [userId]
  );
}

export default function Home() {
  const { user, isLoading: isAuthLoading, signIn, logOut } = useAuth();
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const { history, isLoading: isHistoryLoading, deleteVideo } = useRecentHistory(historyLimit);
  const { allSeries, isLoading: isSeriesLoading, removeSeries } = useSeries();

  const [view, setView] = useState<View>(viewFromHash);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(null);
  const [heroDismissed, setHeroDismissed] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const saveArtwork = useSaveArtwork(user?.uid);

  // #history deep link (used by the popup) + back/forward
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const switchView = (next: View) => {
    setView(next);
    window.history.replaceState(null, '', next === 'history' ? '#history' : window.location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // close the user menu on outside click / Escape; "/" focuses search
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowUserMenu(false);
        if (document.activeElement === searchInputRef.current) {
          setQuery('');
          setSearchOpen(false);
          searchInputRef.current?.blur();
        }
      } else if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const isLoading = isAuthLoading || isHistoryLoading || isSeriesLoading;
  useEffect(() => {
    if (!isLoading) setHasLoadedOnce(true);
  }, [isLoading]);

  const library = useMemo(() => buildLibrary(history, allSeries), [history, allSeries]);

  // search filter
  const q = normalizeName(query);
  const matches = useCallback((text: string) => !q || normalizeName(text).includes(q), [q]);
  const itemTitle = (item: LibraryItem) => (item.type === 'series' ? item.name : item.title);

  const continueWatching = useMemo(
    () => library.continueWatching.filter((i) => matches(itemTitle(i))),
    [library, matches]
  );
  const seriesList = useMemo(() => library.series.filter((s) => matches(s.name)), [library, matches]);
  const movieList = useMemo(() => library.movies.filter((m) => matches(m.title)), [library, matches]);
  const historyEntries = useMemo(
    () => library.entries.filter((e) => matches(`${e.title} ${e.subtitle}`)),
    [library, matches]
  );

  // history rows without their own artwork borrow their series' image
  const seriesArtwork = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of library.series) {
      const art = s.backdropUrl || s.posterUrl;
      if (art) map.set(s.key, art);
    }
    return map;
  }, [library]);

  const selectedSeries = selectedSeriesKey
    ? library.series.find((s) => s.key === selectedSeriesKey) || null
    : null;
  const selectedSeriesModel = useMemo(
    () => (selectedSeries ? toSeries(selectedSeries) : null),
    [selectedSeries]
  );

  const handleEpisodeSelect = (episode: Episode) => {
    setSelectedSeriesKey(null);
    playUrl(episode.url);
  };

  const handleDeleteSeries = async () => {
    if (!selectedSeries) return;
    for (const id of selectedSeries.seriesIds) {
      await removeSeries(id);
    }
  };

  const handleRemoveEntry = async (entry: HistoryEntry) => {
    // removes every stored copy of this video (older links included)
    await deleteVideo(entry.video.url);
  };

  const hero = !heroDismissed && !q && view === 'home' ? library.continueWatching[0] : undefined;
  const isEmpty = library.entries.length === 0 && library.series.length === 0;
  const showSkeleton = isLoading && !hasLoadedOnce;

  return (
    <div className="min-h-screen bg-sw-bg text-sw-text">
      {/* Header — frosted glass, fixed */}
      <header className="fixed top-0 left-0 right-0 z-40 glass-light bg-[rgba(22,18,16,0.85)] border-b border-sw-border">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between gap-4 px-8 py-3.5">
          <div className="flex items-center gap-6 min-w-0">
            <button
              onClick={() => switchView('home')}
              className="font-heading font-bold text-xl text-sw-text flex items-center gap-2.5 hover:opacity-85 transition-opacity"
            >
              <span className="bg-sw-accent rounded-lg w-8 h-8 flex items-center justify-center">
                <Play size={14} fill="#f0ece8" stroke="none" />
              </span>
              StreamWatch
            </button>

            <nav className="flex gap-1">
              {(['home', 'history'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => switchView(v)}
                  className={`nav-tab ${view === v ? 'nav-tab-active' : ''}`}
                >
                  {v === 'home' ? 'Home' : 'History'}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search */}
            <div
              className={`flex items-center h-[38px] rounded-lg border bg-sw-surface overflow-hidden transition-all duration-300 ease-out ${
                searchOpen || query ? 'w-64 border-sw-border focus-within:border-sw-accent' : 'w-[38px] border-sw-border hover:border-sw-text-secondary'
              }`}
            >
              <button
                onClick={() => setSearchOpen(true)}
                className="w-[36px] h-full flex items-center justify-center text-sw-text-secondary hover:text-sw-text flex-shrink-0 transition-colors"
                title="Search your library ( / )"
              >
                <Search size={16} />
              </button>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => { if (!query) setSearchOpen(false); }}
                placeholder="Search your library"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm font-body text-sw-text placeholder:text-sw-text-muted"
                tabIndex={searchOpen || query ? 0 : -1}
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}
                  className="w-8 h-full flex items-center justify-center text-sw-text-muted hover:text-sw-text flex-shrink-0"
                  title="Clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* User Menu */}
            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="w-9 h-9 rounded-full bg-sw-elevated border-2 border-sw-border hover:border-sw-accent transition-colors cursor-pointer overflow-hidden flex items-center justify-center"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sw-text font-bold text-sm">
                      {user.displayName?.[0] || user.email?.[0] || 'U'}
                    </span>
                  )}
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 top-12 w-52 bg-sw-surface border border-sw-border rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.5)] animate-drop-in overflow-hidden">
                    <div className="p-3 border-b border-sw-border">
                      <p className="text-sm font-medium text-sw-text truncate">{user.displayName || 'User'}</p>
                      <p className="text-xs text-sw-text-muted truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { setShowUserMenu(false); chrome.runtime.openOptionsPage(); }}
                      className="w-full px-3 py-2.5 text-left text-sm text-sw-text hover:bg-sw-elevated transition-colors"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); logOut(); }}
                      className="w-full px-3 py-2.5 text-left text-sm text-sw-text hover:bg-sw-elevated transition-colors border-t border-sw-border"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={signIn} disabled={isAuthLoading} className="btn-primary text-sm disabled:opacity-50">
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto pt-[68px] px-8">
        {view === 'home' ? (
          <main key="home" className="pb-20 animate-fade-in">
            {hero && (
              <HeroBanner
                item={hero}
                onDismiss={() => setHeroDismissed(true)}
                onDetails={hero.type === 'series' ? () => setSelectedSeriesKey(hero.key) : undefined}
                onArtwork={saveArtwork}
              />
            )}

            {showSkeleton && (
              <Section title="Continue Watching">
                <div className={GRID}>
                  {Array.from({ length: 5 }).map((_, i) => <MediaCardSkeleton key={i} />)}
                </div>
              </Section>
            )}

            {!showSkeleton && continueWatching.length > 0 && (
              <Section title="Continue Watching" count={continueWatching.length}>
                <div className={GRID}>
                  {continueWatching.map((item, index) =>
                    item.type === 'series' ? (
                      <SeriesItemCard
                        key={`cw-${item.key}`}
                        item={item}
                        mode="continue"
                        index={index}
                        onOpen={() => setSelectedSeriesKey(item.key)}
                        onArtwork={saveArtwork}
                      />
                    ) : (
                      <MovieItemCard key={`cw-${item.key}`} item={item} index={index} onArtwork={saveArtwork} />
                    )
                  )}
                </div>
              </Section>
            )}

            {!showSkeleton && seriesList.length > 0 && (
              <Section title="Series" count={seriesList.length}>
                <div className={GRID}>
                  {seriesList.map((item, index) => (
                    <SeriesItemCard
                      key={item.key}
                      item={item}
                      mode="browse"
                      index={index}
                      onOpen={() => setSelectedSeriesKey(item.key)}
                      onArtwork={saveArtwork}
                    />
                  ))}
                </div>
              </Section>
            )}

            {!showSkeleton && movieList.length > 0 && (
              <Section title="Movies" count={movieList.length}>
                <div className={GRID}>
                  {movieList.map((item, index) => (
                    <MovieItemCard key={item.key} item={item} index={index} onArtwork={saveArtwork} />
                  ))}
                </div>
              </Section>
            )}

            {/* Search with no results */}
            {!showSkeleton && q && continueWatching.length + seriesList.length + movieList.length === 0 && !isEmpty && (
              <EmptyState
                icon={<Search size={30} className="text-sw-text-muted" />}
                title={`Nothing found for "${query}"`}
                text="Try a different title, or check the History tab."
              />
            )}

            {/* Signed out */}
            {!isAuthLoading && !user && (
              <EmptyState
                icon={<Film size={34} className="text-sw-text-muted" />}
                title="Sign in to see your library"
                text="Your watch history, series and progress are stored with your account."
                action={<button onClick={signIn} className="btn-primary mt-5">Sign in with Google</button>}
              />
            )}

            {/* Signed in, nothing watched yet */}
            {!isLoading && user && isEmpty && (
              <EmptyState
                icon={<Film size={34} className="text-sw-text-muted" />}
                title="Your library is empty"
                text={'Find a video link anywhere on the web, right-click it and choose "Play in StreamWatch".'}
              />
            )}
          </main>
        ) : (
          <main key="history" className="pb-20 pt-8 animate-fade-in max-w-[860px] mx-auto">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-sw-text">Watch History</h2>
                <p className="font-body text-sm text-sw-text-muted mt-1">
                  {historyEntries.length > 0
                    ? `${plural(historyEntries.length, 'video')}${q ? ' matching your search' : ''} · click any row to keep watching`
                    : 'Everything you have played'}
                </p>
              </div>
            </div>
            {!isAuthLoading && !user ? (
              <EmptyState
                icon={<Film size={34} className="text-sw-text-muted" />}
                title="Sign in to see your history"
                text="Your watch history is stored with your account."
                action={<button onClick={signIn} className="btn-primary mt-5">Sign in with Google</button>}
              />
            ) : (
              <HistoryView
                entries={historyEntries}
                isLoading={isLoading}
                canLoadMore={history.length >= historyLimit}
                onLoadMore={() => setHistoryLimit((n) => n + HISTORY_PAGE)}
                onPlay={playUrl}
                onRemove={handleRemoveEntry}
                filtered={!!q}
                fallbackArtwork={(entry) => (entry.parsed.seriesKey ? seriesArtwork.get(entry.parsed.seriesKey) : undefined)}
              />
            )}
          </main>
        )}

        <footer className="border-t border-sw-border py-7">
          <div className="flex items-center justify-between text-sm text-sw-text-muted">
            <p>StreamWatch</p>
            <button onClick={() => chrome.runtime.openOptionsPage()} className="hover:text-sw-text transition-colors">
              Settings
            </button>
          </div>
        </footer>
      </div>

      <SeriesDetailModal
        series={selectedSeriesModel}
        isOpen={!!selectedSeriesModel}
        onClose={() => setSelectedSeriesKey(null)}
        onEpisodeSelect={handleEpisodeSelect}
        onDeleteSeries={selectedSeries && selectedSeries.seriesIds.length > 0 ? handleDeleteSeries : undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="pt-8 animate-fade-up">
      <div className="flex items-baseline gap-2.5 mb-4">
        <h3 className="font-heading text-lg font-semibold text-sw-text">{title}</h3>
        {count !== undefined && <span className="font-body text-xs text-sw-text-muted">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-20 animate-fade-up">
      <div className="w-20 h-20 mx-auto mb-6 bg-sw-elevated rounded-full flex items-center justify-center">{icon}</div>
      <h3 className="font-heading text-2xl font-bold mb-2 text-sw-text">{title}</h3>
      <p className="text-sw-text-muted max-w-md mx-auto font-body">{text}</p>
      {action}
    </div>
  );
}

type ArtworkSaver = (historyId: string | undefined, result: PosterResult) => void;

function seriesProgressText(item: LibrarySeries): { tag: string; subtitle: string; percent: number } | null {
  const next = item.next;
  if (!next) return null;
  const hasSeasons = item.episodes.some((e) => e.season !== 1);
  // "E05" is enough when the whole series is a single season
  const tag = formatEpisodeCode(hasSeasons ? next.season : undefined, next.episode);
  const remaining = formatRemaining(next.duration, next.progress);
  const subtitle = next.progressPercent > 0
    ? `${next.progressPercent}% watched${remaining ? ` · ${remaining}` : ''}`
    : 'Up next';
  return { tag, subtitle, percent: next.progressPercent };
}

function SeriesItemCard({
  item,
  mode,
  index,
  onOpen,
  onArtwork,
}: {
  item: LibrarySeries;
  mode: 'continue' | 'browse';
  index: number;
  onOpen: () => void;
  onArtwork: ArtworkSaver;
}) {
  const { image, loading } = useArtwork({
    kind: 'tv',
    query: item.name,
    storedPoster: item.posterUrl,
    storedBackdrop: item.backdropUrl,
    onResolved: (result) => onArtwork(item.historyIds[0], result),
  });

  if (mode === 'continue' && item.next) {
    const info = seriesProgressText(item)!;
    return (
      <MediaCard
        title={item.name}
        subtitle={info.subtitle}
        image={image}
        imageLoading={loading}
        progressPercent={info.percent}
        tag={info.tag}
        index={index}
        onClick={() => playUrl(item.next!.url)}
        onDetails={onOpen}
        detailsLabel="All episodes"
      />
    );
  }

  const seasons = new Set(item.episodes.map((e) => e.season)).size;
  const watched = item.episodes.filter((e) => e.finished).length;
  return (
    <MediaCard
      title={item.name}
      subtitle={`${plural(seasons, 'season')} · ${plural(item.episodes.length, 'episode')}${watched ? ` · ${watched} watched` : ''}`}
      image={image}
      imageLoading={loading}
      index={index}
      onClick={onOpen}
    />
  );
}

function MovieItemCard({ item, index, onArtwork }: { item: LibraryMovie; index: number; onArtwork: ArtworkSaver }) {
  const { video, parsed } = item.entry;
  const { image, loading } = useArtwork({
    kind: 'movie',
    query: parsed.title,
    year: parsed.year,
    storedPoster: video.posterUrl,
    storedBackdrop: video.backdropUrl,
    onResolved: (result) => onArtwork(video.id, result),
  });

  const remaining = formatRemaining(video.duration, video.progress);
  const status = item.finished
    ? ''
    : video.progressPercent > 0
      ? `${video.progressPercent}% watched${remaining ? ` · ${remaining}` : ''}`
      : 'Not started';

  return (
    <MediaCard
      title={item.title}
      subtitle={[item.year, status].filter(Boolean).join(' · ')}
      image={image}
      imageLoading={loading}
      progressPercent={item.finished ? undefined : video.progressPercent}
      watched={item.finished}
      index={index}
      onClick={() => playUrl(video.url)}
    />
  );
}

function HeroBanner({
  item,
  onDismiss,
  onDetails,
  onArtwork,
}: {
  item: LibraryItem;
  onDismiss: () => void;
  onDetails?: () => void;
  onArtwork: ArtworkSaver;
}) {
  const isSeries = item.type === 'series';
  const movieEntry = isSeries ? null : item.entry;
  const storedBackdrop = isSeries ? item.backdropUrl : movieEntry!.video.backdropUrl;

  const { image } = useArtwork({
    kind: isSeries ? 'tv' : 'movie',
    query: isSeries ? item.name : movieEntry!.parsed.title,
    year: isSeries ? undefined : movieEntry!.parsed.year,
    storedPoster: isSeries ? item.posterUrl : movieEntry!.video.posterUrl,
    storedBackdrop,
    onResolved: (result) => onArtwork(isSeries ? item.historyIds[0] : movieEntry!.video.id, result),
  });
  // the banner is big: prefer the full-size backdrop when we have it
  const backdrop = storedBackdrop || image;

  const title = isSeries ? item.name : item.title;
  const url = isSeries ? item.next!.url : movieEntry!.video.url;
  const duration = isSeries ? item.next!.duration : movieEntry!.video.duration;
  const progress = isSeries ? item.next!.progress : movieEntry!.video.progress;
  const percent = isSeries ? item.next!.progressPercent : movieEntry!.video.progressPercent;
  const remaining = formatRemaining(duration, progress);
  const overview = isSeries ? undefined : movieEntry!.video.mediaOverview;

  const detail = [
    isSeries ? `Season ${item.next!.season} · Episode ${item.next!.episode}` : item.year,
    percent > 0 ? `${percent}% watched` : null,
    remaining || null,
  ].filter(Boolean).join('  ·  ');

  return (
    <div className="hero mt-6 animate-fade-in">
      {backdrop && <img src={backdrop} alt="" className="hero-img" />}
      <div className="absolute inset-0 bg-gradient-to-r from-sw-bg via-[rgba(22,18,16,0.88)] to-[rgba(22,18,16,0.25)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-sw-bg/80 via-transparent to-transparent" />

      <button onClick={onDismiss} title="Hide" className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-sw-text-secondary hover:text-sw-text hover:bg-white/10 transition-colors z-10">
        <X size={16} />
      </button>

      <div className="relative h-full flex flex-col justify-end p-8 max-w-[640px]">
        <p className="text-[11px] font-medium text-sw-accent uppercase tracking-[2px] mb-2 animate-fade-up">
          {percent > 0 ? 'Continue watching' : 'Up next'}
        </p>
        <h2 className="font-heading text-[34px] leading-tight font-bold text-sw-text truncate-2 animate-fade-up" style={{ animationDelay: '60ms' }}>
          {title}
        </h2>
        <p className="font-body text-sm text-sw-text-secondary mt-2 animate-fade-up" style={{ animationDelay: '120ms' }}>{detail}</p>
        {overview && (
          <p className="font-body text-sm text-sw-text-muted mt-2.5 truncate-2 animate-fade-up" style={{ animationDelay: '160ms' }}>{overview}</p>
        )}

        <div className="h-1 bg-white/15 rounded-full w-[260px] mt-4 overflow-hidden animate-fade-up" style={{ animationDelay: '180ms' }}>
          <div className="h-full bg-sw-accent rounded-full hero-progress" style={{ width: `${Math.min(100, percent)}%` }} />
        </div>

        <div className="flex items-center gap-2.5 mt-5 animate-fade-up" style={{ animationDelay: '220ms' }}>
          <button onClick={() => playUrl(url)} className="btn-primary flex items-center gap-2">
            <Play size={15} fill="#f0ece8" stroke="none" />
            {percent > 0 ? 'Resume' : 'Play'}
          </button>
          {onDetails && (
            <button onClick={onDetails} className="btn-secondary flex items-center gap-2 bg-[rgba(22,18,16,0.5)]">
              <ListVideo size={15} />
              Episodes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
