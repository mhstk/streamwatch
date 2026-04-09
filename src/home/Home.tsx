import { useState, useEffect, useMemo } from 'react';
import { Play, Search, X, Film } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRecentHistory } from '@/hooks/useRecentHistory';
import { useSeries } from '@/hooks/useSeries';
import { formatTime } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { VideoHistory, Series, Episode } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { getPosterFromFilename } from '@/lib/tmdb';
import { updateVideoPoster, VideoPosterInfo } from '@/lib/firestore';
import SeriesCard from './components/SeriesCard';
import SeriesDetailModal from './components/SeriesDetailModal';

export default function Home() {
  const { user, isLoading: isAuthLoading, signIn, logOut } = useAuth();
  const { history, isLoading: isHistoryLoading } = useRecentHistory(20);
  const { allSeries, removeSeries } = useSeries();
  const [isReady, setIsReady] = useState(false);
  const [heroVideo, setHeroVideo] = useState<VideoHistory | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [heroBackdrop, setHeroBackdrop] = useState<string | null>(null);
  const [heroInfo, setHeroInfo] = useState<{ title: string; year?: number; rating?: number; overview?: string } | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [heroDismissed, setHeroDismissed] = useState(false);

  useEffect(() => {
    logger.info('home', 'Home page mounted');
    setTimeout(() => setIsReady(true), 100);
  }, []);

  // Load hero poster (from stored data or fetch from TMDB)
  useEffect(() => {
    if (!heroVideo) return;

    // First check if poster data is already stored
    if (heroVideo.backdropUrl) {
      setHeroBackdrop(heroVideo.backdropUrl);
      setHeroInfo({
        title: heroVideo.mediaTitle || heroVideo.title,
        year: heroVideo.mediaYear,
        rating: heroVideo.mediaRating,
        overview: heroVideo.mediaOverview,
      });
      return;
    }

    // Fetch from TMDB if not stored
    let cancelled = false;
    const fetchPoster = async () => {
      try {
        const result = await getPosterFromFilename(heroVideo.title);
        if (cancelled) return;

        if (result.backdrop || result.info) {
          setHeroBackdrop(result.backdrop);
          setHeroInfo(result.info ? {
            title: result.info.title,
            year: result.info.year,
            rating: result.info.rating,
            overview: result.info.overview,
          } : null);

          // Save to Firestore for next time (only if user is logged in)
          if (user && result.info) {
            const posterInfo: VideoPosterInfo = {
              posterUrl: result.medium || undefined,
              backdropUrl: result.backdrop || undefined,
              mediaTitle: result.info.title,
              mediaYear: result.info.year,
              mediaType: result.info.type,
              mediaRating: result.info.rating,
              mediaOverview: result.info.overview,
            };
            updateVideoPoster(user.uid, heroVideo.url, posterInfo).catch(err => {
              logger.error('home', 'Failed to save hero poster', err);
            });
          }
        }
      } catch (err) {
        logger.error('home', 'Failed to fetch hero poster', err);
      }
    };

    fetchPoster();
    return () => { cancelled = true; };
  }, [heroVideo, user]);

  // Set hero video to most recent
  useEffect(() => {
    if (history.length > 0 && !heroVideo) {
      setHeroVideo(history[0]);
    }
  }, [history, heroVideo]);

  const handlePlayVideo = (url: string) => {
    const playerUrl = chrome.runtime.getURL(`index.html?url=${encodeURIComponent(url)}`);
    window.location.href = playerUrl;
  };

  const continueWatching = history.filter(v => v.progressPercent < 95);

  // Debug: Log continue watching data
  useEffect(() => {
    if (continueWatching.length > 0) {
      console.log('=== CONTINUE WATCHING DEBUG ===');
      console.log('Total continueWatching videos:', continueWatching.length);
      console.log('Videos in order (most recent first):');
      continueWatching.forEach((v, i) => {
        const matchingSeries = allSeries.find(s => s.episodes.some(ep => ep.url === v.url));
        console.log(`${i + 1}. ${v.title}`);
        console.log(`   URL: ${v.url.substring(0, 80)}...`);
        console.log(`   LastWatched: ${v.lastWatched.toDate().toISOString()}`);
        console.log(`   Progress: ${v.progressPercent}%`);
        console.log(`   In Series: ${matchingSeries ? matchingSeries.name : 'NO (standalone)'}`);
        if (matchingSeries) {
          const ep = matchingSeries.episodes.find(ep => ep.url === v.url);
          console.log(`   Episode lastWatched: ${ep?.lastWatched ? ep.lastWatched.toDate().toISOString() : 'NOT SET'}`);
        }
      });
      console.log('=== END DEBUG ===');
    }
  }, [continueWatching, allSeries]);

  // Group Continue Watching: respects global watch history order
  const groupedContinueWatching = useMemo(() => {
    const result: Array<
      | { type: 'series'; series: Series; latestEpisode: VideoHistory; episodeInfo: { season: number; episode: number } }
      | { type: 'video'; video: VideoHistory }
    > = [];
    const seenSeriesIds = new Set<string>();

    // Iterate through continueWatching (already sorted by lastWatched desc from history)
    for (const video of continueWatching) {
      // Check if this video belongs to a series
      const matchingSeries = allSeries.find(s => s.episodes.some(ep => ep.url === video.url));

      if (matchingSeries) {
        // Skip if we've already shown this series
        if (seenSeriesIds.has(matchingSeries.id)) continue;
        seenSeriesIds.add(matchingSeries.id);

        // Find the most recently watched episode in this series
        // Look at ALL episodes' lastWatched field, not just those in recent history
        console.log(`[groupedCW] Series: ${matchingSeries.name} (${matchingSeries.episodes.length} episodes)`);
        const episodesWithLastWatched = matchingSeries.episodes
          .map(ep => {
            const videoHist = history.find(v => v.url === ep.url);
            console.log(`  [ep] S${ep.season}E${ep.episodeNumber ?? ep.index+1} "${ep.title}" | ep.lastWatched: ${ep.lastWatched ? ep.lastWatched.toDate().toISOString() : 'NONE'} | videoHist: ${videoHist ? `${videoHist.progressPercent}%` : 'NOT IN HISTORY'} | completed: ${ep.completed}`);
            // Need at least one lastWatched source
            const lastWatched = ep.lastWatched || videoHist?.lastWatched;
            if (!lastWatched) return null;
            return { ep, videoHist, lastWatched };
          })
          .filter(item => item !== null) as Array<{ ep: Episode; videoHist: VideoHistory | null; lastWatched: Timestamp }>;

        if (episodesWithLastWatched.length === 0) continue;

        // Sort by lastWatched descending (most recent first)
        episodesWithLastWatched.sort((a, b) => b!.lastWatched.toMillis() - a!.lastWatched.toMillis());

        const latest = episodesWithLastWatched[0]!;
        console.log(`[groupedCW] Winner: S${latest.ep.season}E${latest.ep.episodeNumber ?? latest.ep.index+1} "${latest.ep.title}" lastWatched: ${latest.lastWatched.toDate().toISOString()} (from ${latest.ep.lastWatched ? 'episode' : 'videoHist'})`);
        // Build VideoHistory for display - use video history if available, else derive from episode data
        const latestVideoHistory: VideoHistory = latest.videoHist || {
          id: '',
          url: latest.ep.url,
          title: latest.ep.title,
          sourceHost: '',
          duration: latest.ep.duration || 0,
          progress: latest.ep.progress || 0,
          progressPercent: latest.ep.duration ? Math.round(((latest.ep.progress || 0) / latest.ep.duration) * 100) : 0,
          completed: latest.ep.completed || false,
          lastWatched: latest.lastWatched,
          createdAt: latest.lastWatched,
        };

        result.push({
          type: 'series',
          series: matchingSeries,
          latestEpisode: latestVideoHistory,
          episodeInfo: {
            season: latest.ep.season,
            episode: latest.ep.episodeNumber ?? latest.ep.index + 1,
          },
        });
      } else {
        // Standalone video (movie)
        result.push({
          type: 'video',
          video,
        });
      }
    }

    // Split into separate arrays for rendering
    const seriesItems = result.filter(item => item.type === 'series').map(item => {
      const { type, ...rest } = item;
      return rest;
    });
    const standaloneVideos = result.filter(item => item.type === 'video').map(item => item.video);

    return {
      seriesItems,
      standaloneVideos,
    };
  }, [continueWatching, allSeries, history]);

  // Compute "My Movies" - standalone videos not in any series
  const myMovies = useMemo(() => {
    return history.filter(video => {
      // Check if this video belongs to any series
      const isInSeries = allSeries.some(s =>
        s.episodes.some(ep => ep.url === video.url)
      );
      return !isInSeries;
    });
  }, [history, allSeries]);

  // Handle episode selection from series modal
  const handleEpisodeSelect = (episode: Episode) => {
    handlePlayVideo(episode.url);
    setSelectedSeries(null);
  };

  const continueWatchingCount = groupedContinueWatching.seriesItems.length + groupedContinueWatching.standaloneVideos.length;

  return (
    <div className={`min-h-screen bg-sw-bg text-sw-text transition-opacity duration-500 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
      {/* Header — frosted glass, fixed */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-light bg-[rgba(22,18,16,0.85)] border-b border-sw-border">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between px-8 py-4">
          {/* Logo + Nav */}
          <div className="flex items-center gap-6">
            <div className="font-heading font-bold text-xl text-sw-text flex items-center gap-2.5">
              <div className="bg-sw-accent rounded-lg w-8 h-8 flex items-center justify-center">
                <Play size={14} fill="#f0ece8" stroke="none" />
              </div>
              StreamWatch
            </div>

            {/* Nav Links */}
            <nav className="flex gap-1.5">
              <button className="font-body text-[13px] font-medium px-4 py-1.5 rounded-lg transition-all duration-200 text-sw-text bg-sw-surface">
                Home
              </button>
              <button className="font-body text-[13px] font-medium px-4 py-1.5 rounded-lg transition-all duration-200 text-sw-text-muted hover:text-sw-text hover:bg-sw-elevated cursor-pointer">
                My List
              </button>
              <button className="font-body text-[13px] font-medium px-4 py-1.5 rounded-lg transition-all duration-200 text-sw-text-muted hover:text-sw-text hover:bg-sw-elevated cursor-pointer">
                History
              </button>
            </nav>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2.5">
            {/* Search */}
            <button className="btn-icon">
              <Search size={16} />
            </button>

            {/* User Menu */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-8 h-8 rounded-full bg-sw-elevated border-2 border-sw-border hover:border-sw-accent transition-colors cursor-pointer overflow-hidden flex items-center justify-center"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sw-text font-bold text-sm">
                      {user.displayName?.[0] || user.email?.[0] || 'U'}
                    </span>
                  )}
                </button>

                {/* Dropdown */}
                {showUserMenu && (
                  <div className="absolute right-0 top-11 w-48 bg-sw-surface border border-sw-border rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.5)] animate-drop-in">
                    <div className="p-3 border-b border-sw-border">
                      <p className="text-sm font-medium text-sw-text truncate">{user.displayName || 'User'}</p>
                      <p className="text-xs text-sw-text-muted truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => chrome.runtime.openOptionsPage()}
                      className="w-full px-3 py-2 text-left text-sm text-sw-text hover:bg-sw-elevated transition-colors"
                    >
                      Settings
                    </button>
                    <button
                      onClick={logOut}
                      className="w-full px-3 py-2 text-left text-sm text-sw-text hover:bg-sw-elevated transition-colors border-t border-sw-border"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={signIn}
                disabled={isAuthLoading}
                className="btn-primary text-sm"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content — offset for fixed header */}
      <div className="max-w-[1280px] mx-auto pt-[72px]">

        {/* Compact Hero Banner — only when there's a video to continue and not dismissed */}
        {heroVideo && !heroDismissed && continueWatching.length > 0 && (
          <div className="mx-8 mt-6 p-7 rounded-2xl border border-sw-border bg-gradient-to-r from-sw-elevated via-sw-surface to-[#2a1a18] animate-fade-in">
            <div className="flex items-center gap-7">
              {/* Poster thumbnail */}
              <div className="w-[100px] h-[60px] rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-sw-elevated to-sw-surface flex items-center justify-center">
                {heroBackdrop ? (
                  <img src={heroBackdrop} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Play size={22} className="text-sw-accent" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-sw-accent uppercase tracking-[1.5px] mb-1.5">
                  Continue Watching
                </p>
                <p className="font-heading text-xl font-bold text-sw-text truncate">
                  {heroInfo?.title || heroVideo.title}
                </p>
                <p className="text-xs text-sw-text-muted mt-0.5">
                  {heroVideo.progressPercent}% watched{heroInfo?.year ? ` · ${heroInfo.year}` : ''}{heroVideo.duration ? ` · ${formatTime(heroVideo.duration)}` : ''}
                </p>
                {/* Progress bar */}
                <div className="h-[3px] bg-sw-border rounded w-[200px] mt-2.5">
                  <div
                    className="h-full bg-sw-accent rounded"
                    style={{ width: `${heroVideo.progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <button
                  onClick={() => handlePlayVideo(heroVideo.url)}
                  className="btn-primary text-sm flex items-center gap-1.5"
                >
                  <Play size={14} fill="#f0ece8" stroke="none" />
                  Resume
                </button>
                <button
                  onClick={() => setHeroDismissed(true)}
                  className="btn-icon w-9 h-9"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Rows */}
        <main className="pb-20">
          {/* Continue Watching - grouped by series */}
          {continueWatchingCount > 0 && (
            <div className="px-8 pt-7">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-lg font-semibold text-sw-text">Continue Watching</h3>
                <span className="text-xs text-sw-text-muted">{continueWatchingCount} {continueWatchingCount === 1 ? 'video' : 'videos'}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                {groupedContinueWatching.seriesItems.map(({ series, latestEpisode, episodeInfo }, index) => (
                  <div
                    key={series.id}
                    className="animate-fade-up opacity-0"
                    style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
                    onAnimationEnd={(e) => { e.currentTarget.style.animation = 'none'; e.currentTarget.style.opacity = '1'; }}
                  >
                    <SeriesCard
                      series={series}
                      onClick={() => setSelectedSeries(series)}
                      onPlay={handlePlayVideo}
                      continueUrl={latestEpisode.url}
                      continueInfo={{
                        season: episodeInfo.season,
                        episode: episodeInfo.episode,
                        title: latestEpisode.title,
                        progressPercent: latestEpisode.progressPercent,
                      }}
                    />
                  </div>
                ))}
                {groupedContinueWatching.standaloneVideos.map((video, index) => (
                  <div
                    key={video.id}
                    className="animate-fade-up opacity-0"
                    style={{ animationDelay: `${(groupedContinueWatching.seriesItems.length + index) * 0.05}s`, animationFillMode: 'forwards' }}
                    onAnimationEnd={(e) => { e.currentTarget.style.animation = 'none'; e.currentTarget.style.opacity = '1'; }}
                  >
                    <VideoCard
                      video={video}
                      onPlay={handlePlayVideo}
                      showProgress
                      userId={user?.uid}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My Series */}
          {allSeries.length > 0 && (
            <div className="px-8 pt-7">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-lg font-semibold text-sw-text">My Series</h3>
                <span className="text-xs text-sw-text-muted">{allSeries.length} {allSeries.length === 1 ? 'series' : 'series'}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                {allSeries.map((series, index) => (
                  <div
                    key={series.id}
                    className="animate-fade-up opacity-0"
                    style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
                    onAnimationEnd={(e) => { e.currentTarget.style.animation = 'none'; e.currentTarget.style.opacity = '1'; }}
                  >
                    <SeriesCard
                      series={series}
                      onClick={() => setSelectedSeries(series)}
                      onPlay={handlePlayVideo}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My Movies - standalone videos not in any series */}
          {myMovies.length > 0 && (
            <div className="px-8 pt-7">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-lg font-semibold text-sw-text">My Movies</h3>
                <span className="text-xs text-sw-text-muted">{myMovies.length} {myMovies.length === 1 ? 'movie' : 'movies'}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                {myMovies.map((video, index) => (
                  <div
                    key={video.id}
                    className="animate-fade-up opacity-0"
                    style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
                    onAnimationEnd={(e) => { e.currentTarget.style.animation = 'none'; e.currentTarget.style.opacity = '1'; }}
                  >
                    <VideoCard
                      video={video}
                      onPlay={handlePlayVideo}
                      showProgress
                      userId={user?.uid}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isHistoryLoading && history.length === 0 && allSeries.length === 0 && (
            <div className="px-8 pt-7">
              <div className="text-center py-20">
                <div className="w-20 h-20 mx-auto mb-6 bg-sw-elevated rounded-full flex items-center justify-center">
                  <Film size={36} className="text-sw-text-muted" />
                </div>
                <h3 className="font-heading text-2xl font-bold mb-2 text-sw-text">Your library is empty</h3>
                <p className="text-sw-text-muted max-w-md mx-auto font-body">
                  Find a video link anywhere on the web, right-click it, and select "Play in StreamWatch" to add it to your library.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-sw-border py-8 px-8">
          <div className="flex items-center justify-between text-sm text-sw-text-muted">
            <p>&copy; 2024 StreamWatch</p>
            <div className="flex items-center gap-4">
              <button onClick={() => chrome.runtime.openOptionsPage()} className="hover:text-sw-text transition-colors">
                Settings
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Series Detail Modal */}
      <SeriesDetailModal
        series={selectedSeries}
        isOpen={!!selectedSeries}
        onClose={() => setSelectedSeries(null)}
        onEpisodeSelect={handleEpisodeSelect}
        onDeleteSeries={removeSeries}
      />
    </div>
  );
}

// Video Card Component
interface VideoCardProps {
  video: VideoHistory;
  onPlay: (url: string) => void;
  showProgress?: boolean;
  userId?: string;
}

function VideoCard({ video, onPlay, showProgress, userId }: VideoCardProps) {
  const [poster, setPoster] = useState<string | null>(video.posterUrl || null);
  const [info, setInfo] = useState<{ title: string; year?: number } | null>(
    video.mediaTitle ? { title: video.mediaTitle, year: video.mediaYear } : null
  );
  const [isLoading, setIsLoading] = useState(!video.posterUrl);

  // Fetch poster from TMDB only if not stored in history
  useEffect(() => {
    logger.debug('home', 'VideoCard useEffect', {
      title: video.title,
      hasPosterUrl: !!video.posterUrl,
      posterUrl: video.posterUrl
    });

    if (video.posterUrl) {
      // Already have stored poster
      logger.debug('home', 'Using stored poster', { title: video.title });
      setPoster(video.posterUrl);
      setInfo({ title: video.mediaTitle || video.title, year: video.mediaYear });
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const fetchPoster = async () => {
      logger.info('home', 'Fetching poster from TMDB', { title: video.title });
      try {
        const result = await getPosterFromFilename(video.title);
        logger.debug('home', 'TMDB result', {
          title: video.title,
          hasMedium: !!result.medium,
          hasInfo: !!result.info
        });
        if (cancelled) return;

        setPoster(result.medium);
        setInfo(result.info ? { title: result.info.title, year: result.info.year } : null);
        setIsLoading(false);

        // Save to Firestore for next time
        if (userId && result.info) {
          logger.info('home', 'Saving poster to Firestore', { title: video.title, userId });
          const posterInfo: VideoPosterInfo = {
            posterUrl: result.medium || undefined,
            backdropUrl: result.backdrop || undefined,
            mediaTitle: result.info.title,
            mediaYear: result.info.year,
            mediaType: result.info.type,
            mediaRating: result.info.rating,
            mediaOverview: result.info.overview,
          };
          updateVideoPoster(userId, video.url, posterInfo).catch(err => {
            logger.error('home', 'Failed to save poster', err);
          });
        }
      } catch (err) {
        logger.error('home', 'Failed to fetch poster', { title: video.title, error: err });
        setIsLoading(false);
      }
    };

    fetchPoster();
    return () => { cancelled = true; };
  }, [video.posterUrl, video.title, video.url, video.mediaTitle, video.mediaYear, userId]);

  return (
    <div
      className="group relative"
    >
      <div
        className="card"
        onClick={() => onPlay(video.url)}
      >
        {/* Thumbnail / Poster */}
        <div className="aspect-video relative flex items-center justify-center bg-gradient-to-br from-sw-elevated to-sw-surface overflow-hidden">
          {poster ? (
            <img
              src={poster}
              alt={info?.title || video.title}
              className="object-cover w-full h-full"
            />
          ) : isLoading ? (
            <div className="w-8 h-8 border-2 border-sw-accent/30 border-t-sw-accent rounded-full animate-spin" />
          ) : (
            <Play size={24} className="text-sw-text-muted transition-all duration-200 group-hover:text-sw-accent group-hover:scale-[1.15]" />
          )}

          {/* Progress Bar */}
          {showProgress && video.progressPercent > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-sw-border">
              <div
                className="h-full bg-sw-accent"
                style={{ width: `${video.progressPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="p-2.5 px-3">
          <p className="font-heading text-[13px] font-semibold text-sw-text truncate">
            {info?.title || video.title}
          </p>
          <p className="font-body text-[11px] text-sw-text-muted mt-0.5">
            {info?.year ? `${info.year} · ` : ''}{video.progressPercent >= 95 ? 'Watched' : `${video.progressPercent}% watched`}
          </p>
        </div>
      </div>
    </div>
  );
}
