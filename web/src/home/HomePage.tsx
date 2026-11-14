// Library home + history (web version of ../src/home/Home.tsx).
// Data logic comes from the extension (hooks, lib/library); the layout is responsive.
import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { Play, Search, X, Film, ListVideo, Link2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRecentHistory } from '@/hooks/useRecentHistory';
import { useSeries } from '@/hooks/useSeries';
import { logger } from '@/lib/logger';
import type { Episode } from '@/types';
import type { PosterResult } from '@/lib/tmdb';
import { updateVideoPoster } from '@/lib/firestore';
import { buildLibrary, toSeries, type HistoryEntry, type LibraryItem, type LibraryMovie, type LibrarySeries } from '@/lib/library';
import { formatEpisodeCode, normalizeName } from '@/lib/titleParser';
import { useArtwork } from '@/home/components/MediaCard';
import { formatRemaining } from '@/home/components/HistoryView';
import { Link, navigate, playerPath } from '~/router';
import MediaCard, { MediaCardSkeleton } from './MediaCard';
import HistoryList from './HistoryList';
import SeriesDetail from './SeriesDetail';
import PlayLinkDialog from './PlayLinkDialog';
import Header, { type View } from './Header';
import { DESKTOP_QUERY, useBackToClose, useBodyScrollLock, useMediaQuery } from './hooks';

/** How many history records to load at a time */
const HISTORY_PAGE = 300;

/** Two columns on phones, three on large phones / small tablets, then the extension's auto-fill grid */
const GRID =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] md:gap-4';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function playUrl(url: string): void {
  navigate(playerPath(url));
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

type Overlay = { kind: 'series'; key: string } | { kind: 'link' } | null;

export default function HomePage({ view }: { view: View }) {
  const { user, isLoading: isAuthLoading, signIn, logOut } = useAuth();
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const { history, isLoading: isHistoryLoading, deleteVideo } = useRecentHistory(historyLimit);
  const { allSeries, isLoading: isSeriesLoading, removeSeries } = useSeries();
  const desktop = useMediaQuery(DESKTOP_QUERY);

  const [query, setQuery] = useState('');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [heroDismissed, setHeroDismissed] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const saveArtwork = useSaveArtwork(user?.uid);

  const closeOverlay = useCallback(() => setOverlay(null), []);
  // Back button / gesture closes the open sheet or dialog
  const releaseOverlayHistory = useBackToClose(overlay !== null, closeOverlay);
  useBodyScrollLock(overlay !== null);

  /** Leave for the player from inside an overlay: the player takes over the overlay's history entry */
  const playFromOverlay = (url: string) => {
    releaseOverlayHistory();
    setOverlay(null);
    navigate(playerPath(url), { replace: true });
  };

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

  const selectedSeries =
    overlay?.kind === 'series' ? library.series.find((s) => s.key === overlay.key) || null : null;
  const selectedSeriesModel = useMemo(() => (selectedSeries ? toSeries(selectedSeries) : null), [selectedSeries]);
  const openSeries = (key: string) => setOverlay({ kind: 'series', key });

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
  const openPlayLink = () => setOverlay({ kind: 'link' });

  const signInButton = (
    <button onClick={signIn} className="btn-primary mt-5 max-md:min-h-[44px]">Sign in with Google</button>
  );

  return (
    <div className="min-h-[100dvh] bg-sw-bg text-sw-text pb-[calc(64px+env(safe-area-inset-bottom,0px))] md:pb-0">
      <Header
        view={view}
        user={user}
        isAuthLoading={isAuthLoading}
        signIn={signIn}
        logOut={logOut}
        query={query}
        onQueryChange={setQuery}
        onPlayLink={openPlayLink}
      />

      <div className="max-w-[1280px] mx-auto px-gutter lg:px-8 pt-[calc(56px+env(safe-area-inset-top,0px))] md:pt-[calc(62px+env(safe-area-inset-top,0px))] lg:pt-[68px]">
        {view === 'home' ? (
          <main key="home" className="pb-10 md:pb-20 animate-fade-in">
            {hero && (
              <HeroBanner
                item={hero}
                onDismiss={() => setHeroDismissed(true)}
                onDetails={hero.type === 'series' ? () => openSeries(hero.key) : undefined}
                onArtwork={saveArtwork}
              />
            )}

            {showSkeleton && (
              <Section title="Continue Watching">
                <div className={GRID}>
                  {Array.from({ length: 4 }).map((_, i) => <MediaCardSkeleton key={i} />)}
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
                        onOpen={() => openSeries(item.key)}
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
                      onOpen={() => openSeries(item.key)}
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
                action={signInButton}
              />
            )}

            {/* Signed in, nothing watched yet */}
            {!isLoading && user && isEmpty && (
              <EmptyState
                icon={<Film size={34} className="text-sw-text-muted" />}
                title="Your library is empty"
                text="Paste a video link here to start watching, or use the StreamWatch extension on a computer. Everything you play shows up here on all your devices."
                action={
                  <button onClick={openPlayLink} className="btn-primary mt-5 inline-flex items-center gap-2 max-md:min-h-[44px]">
                    <Link2 size={15} />
                    Play a link
                  </button>
                }
              />
            )}
          </main>
        ) : (
          <main key="history" className="pb-10 md:pb-20 pt-6 md:pt-8 animate-fade-in max-w-[860px] mx-auto">
            <div className="flex items-end justify-between mb-5 md:mb-6">
              <div className="min-w-0">
                <h2 className="font-heading text-2xl max-md:text-xl font-bold text-sw-text">Watch History</h2>
                <p className="font-body text-sm text-sw-text-muted mt-1">
                  {historyEntries.length > 0
                    ? `${plural(historyEntries.length, 'video')}${q ? ' matching your search' : ''}${desktop ? ' · click any row to keep watching' : ''}`
                    : 'Everything you have played'}
                </p>
              </div>
            </div>
            {!isAuthLoading && !user ? (
              <EmptyState
                icon={<Film size={34} className="text-sw-text-muted" />}
                title="Sign in to see your history"
                text="Your watch history is stored with your account."
                action={signInButton}
              />
            ) : (
              <HistoryList
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

        <footer className="border-t border-sw-border py-7 max-md:py-5">
          <div className="flex items-center justify-between text-sm text-sw-text-muted">
            <p>StreamWatch</p>
            <Link to="/settings" className="hover:text-sw-text transition-colors max-md:py-3 max-md:-my-3 max-md:px-2 max-md:-mx-2">
              Settings
            </Link>
          </div>
        </footer>
      </div>

      {selectedSeries && selectedSeriesModel && (
        <SeriesDetail
          key={selectedSeries.key}
          series={selectedSeriesModel}
          variant={desktop ? 'modal' : 'sheet'}
          nextUrl={selectedSeries.next?.url}
          onClose={closeOverlay}
          onEpisodeSelect={(episode: Episode) => playFromOverlay(episode.url)}
          onDeleteSeries={selectedSeries.seriesIds.length > 0 ? handleDeleteSeries : undefined}
        />
      )}

      {overlay?.kind === 'link' && (
        <PlayLinkDialog variant={desktop ? 'modal' : 'sheet'} onClose={closeOverlay} onPlay={playFromOverlay} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="pt-8 max-md:pt-6 animate-fade-up">
      <div className="flex items-baseline gap-2.5 mb-4 max-md:mb-3">
        <h3 className="font-heading text-lg font-semibold text-sw-text">{title}</h3>
        {count !== undefined && <span className="font-body text-xs text-sw-text-muted">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="text-center py-20 max-md:py-14 animate-fade-up">
      <div className="w-20 h-20 mx-auto mb-6 bg-sw-elevated rounded-full flex items-center justify-center">{icon}</div>
      <h3 className="font-heading text-2xl max-md:text-xl font-bold mb-2 text-sw-text">{title}</h3>
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
    <div className="hero mt-6 max-md:mt-4 max-md:h-[236px] max-md:rounded-2xl animate-fade-in">
      {backdrop && <img src={backdrop} alt="" className="hero-img" />}
      <div className="absolute inset-0 bg-gradient-to-r from-sw-bg via-[rgba(22,18,16,0.88)] to-[rgba(22,18,16,0.25)] max-md:via-[rgba(22,18,16,0.6)] max-md:to-[rgba(22,18,16,0.1)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-sw-bg/80 via-transparent to-transparent max-md:from-sw-bg max-md:via-sw-bg/40" />

      <button
        onClick={onDismiss}
        title="Hide"
        aria-label="Hide banner"
        className="absolute top-3 right-3 max-md:top-1.5 max-md:right-1.5 w-8 h-8 max-md:w-11 max-md:h-11 rounded-lg flex items-center justify-center text-sw-text-secondary hover:text-sw-text hover:bg-white/10 transition-colors z-10"
      >
        <X size={16} />
      </button>

      <div className="relative h-full flex flex-col justify-end p-8 max-md:p-4 max-w-[640px]">
        <p className="text-[11px] font-medium text-sw-accent uppercase tracking-[2px] mb-2 max-md:mb-1 animate-fade-up">
          {percent > 0 ? 'Continue watching' : 'Up next'}
        </p>
        <h2
          className="font-heading text-[34px] max-md:text-2xl leading-tight font-bold text-sw-text truncate-2 max-md:pr-8 animate-fade-up"
          style={{ animationDelay: '60ms' }}
        >
          {title}
        </h2>
        <p className="font-body text-sm max-md:text-[13px] text-sw-text-secondary mt-2 max-md:mt-1 truncate animate-fade-up" style={{ animationDelay: '120ms' }}>
          {detail}
        </p>
        {overview && (
          <p
            className="font-body text-sm text-sw-text-muted mt-2.5 truncate-2 max-md:line-clamp-1 max-md:mt-1 max-md:text-[13px] animate-fade-up"
            style={{ animationDelay: '160ms' }}
          >
            {overview}
          </p>
        )}

        <div
          className="h-1 bg-white/15 rounded-full w-[260px] max-md:w-[200px] max-w-full mt-4 max-md:mt-3 overflow-hidden animate-fade-up"
          style={{ animationDelay: '180ms' }}
        >
          <div className="h-full bg-sw-accent rounded-full hero-progress" style={{ width: `${Math.min(100, percent)}%` }} />
        </div>

        <div className="flex items-center gap-2.5 mt-5 max-md:mt-3.5 animate-fade-up" style={{ animationDelay: '220ms' }}>
          <button onClick={() => playUrl(url)} className="btn-primary flex items-center justify-center gap-2 max-md:min-h-[44px] max-md:px-5">
            <Play size={15} fill="#f0ece8" stroke="none" />
            {percent > 0 ? 'Resume' : 'Play'}
          </button>
          {onDetails && (
            <button onClick={onDetails} className="btn-secondary flex items-center justify-center gap-2 bg-[rgba(22,18,16,0.5)] max-md:min-h-[44px] max-md:px-5">
              <ListVideo size={15} />
              Episodes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
