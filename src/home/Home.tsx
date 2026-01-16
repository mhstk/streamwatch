import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRecentHistory } from '@/hooks/useRecentHistory';
import { formatTime } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { VideoHistory } from '@/types';
import { getPosterFromFilename } from '@/lib/tmdb';
import { updateVideoPoster, VideoPosterInfo } from '@/lib/firestore';

export default function Home() {
  const { user, isLoading: isAuthLoading, signIn, logOut } = useAuth();
  const { history, isLoading: isHistoryLoading } = useRecentHistory(20);
  const [isReady, setIsReady] = useState(false);
  const [heroVideo, setHeroVideo] = useState<VideoHistory | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [heroBackdrop, setHeroBackdrop] = useState<string | null>(null);
  const [heroInfo, setHeroInfo] = useState<{ title: string; year?: number; rating?: number; overview?: string } | null>(null);

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
  const completed = history.filter(v => v.progressPercent >= 95);

  return (
    <div className={`min-h-screen bg-sw-dark text-white transition-opacity duration-500 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
        <div className="bg-gradient-to-b from-black/80 via-black/50 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2 cursor-pointer group">
                  <div className="w-10 h-10 bg-sw-red rounded-lg flex items-center justify-center transform group-hover:scale-105 transition-transform">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    <span className="text-sw-red">Stream</span>Watch
                  </h1>
                </div>

                {/* Nav Links */}
                <nav className="hidden md:flex items-center gap-6">
                  <a href="#" className="text-white font-medium hover:text-sw-gray transition-colors">Home</a>
                  <a href="#" className="text-sw-gray hover:text-white transition-colors">My List</a>
                  <a href="#" className="text-sw-gray hover:text-white transition-colors">History</a>
                </nav>
              </div>

              {/* Right Side */}
              <div className="flex items-center gap-4">
                {/* Search */}
                <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>

                {/* User Menu */}
                {user ? (
                  <div className="relative">
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="flex items-center gap-2 group"
                    >
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" className="w-8 h-8 rounded-md" />
                      ) : (
                        <div className="w-8 h-8 rounded-md bg-sw-red flex items-center justify-center text-white font-bold text-sm">
                          {user.displayName?.[0] || user.email?.[0] || 'U'}
                        </div>
                      )}
                      <svg className={`w-4 h-4 text-white transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Dropdown */}
                    {showUserMenu && (
                      <div className="absolute right-0 top-12 w-48 bg-black/95 border border-gray-700 rounded-md shadow-xl animate-fade-in">
                        <div className="p-3 border-b border-gray-700">
                          <p className="text-sm font-medium truncate">{user.displayName || 'User'}</p>
                          <p className="text-xs text-sw-gray truncate">{user.email}</p>
                        </div>
                        <button
                          onClick={() => chrome.runtime.openOptionsPage()}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors"
                        >
                          Settings
                        </button>
                        <button
                          onClick={logOut}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors border-t border-gray-700"
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
                    className="px-4 py-1.5 bg-sw-red text-white text-sm font-medium rounded hover:bg-red-600 transition-colors"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative h-[85vh] min-h-[600px]">
        {/* Backdrop Image */}
        {heroBackdrop && (
          <div className="absolute inset-0">
            <img
              src={heroBackdrop}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          </div>
        )}

        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-sw-dark via-transparent to-transparent z-10" />

        {/* Hero Background Pattern (fallback when no backdrop) */}
        {!heroBackdrop && (
          <div className="absolute inset-0 bg-gradient-to-br from-sw-red/20 via-transparent to-transparent opacity-50" />
        )}

        {/* Content */}
        <div className="relative z-20 h-full flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16">
            <div className="max-w-2xl space-y-6 animate-slide-up">
              {heroVideo ? (
                <>
                  {/* Badge */}
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-sw-red text-xs font-bold rounded">CONTINUE WATCHING</span>
                    <span className="text-sw-gray text-sm">{heroVideo.progressPercent}% watched</span>
                  </div>

                  {/* Title */}
                  <h2 className="text-5xl md:text-6xl font-bold leading-tight">
                    {heroInfo?.title || heroVideo.title}
                  </h2>

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-sw-gray">
                    <span className="text-green-500 font-medium">{heroVideo.progressPercent}% Complete</span>
                    {heroInfo?.year && <span>{heroInfo.year}</span>}
                    <span>{formatTime(heroVideo.duration)}</span>
                    {heroInfo?.rating && heroInfo.rating > 0 && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {heroInfo.rating.toFixed(1)}
                      </span>
                    )}
                    <span className="px-2 py-0.5 border border-sw-gray/50 text-xs">HD</span>
                  </div>

                  {/* Overview */}
                  {heroInfo?.overview && (
                    <p className="text-sw-light-gray text-lg max-w-xl line-clamp-3">
                      {heroInfo.overview}
                    </p>
                  )}

                  {/* Progress Bar */}
                  <div className="w-full max-w-md h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sw-red rounded-full transition-all duration-500"
                      style={{ width: `${heroVideo.progressPercent}%` }}
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => handlePlayVideo(heroVideo.url)}
                      className="flex items-center gap-2 px-8 py-3 bg-white text-black font-bold rounded-md hover:bg-white/90 transition-all transform hover:scale-105 active:scale-95"
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                      Resume
                    </button>
                    <button className="flex items-center gap-2 px-6 py-3 bg-gray-500/50 text-white font-bold rounded-md hover:bg-gray-500/70 transition-all backdrop-blur-sm">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      More Info
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Empty State */}
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-sw-red text-xs font-bold rounded">WELCOME</span>
                  </div>
                  <h2 className="text-5xl md:text-6xl font-bold leading-tight">
                    Start Watching
                  </h2>
                  <p className="text-xl text-sw-gray max-w-lg">
                    Right-click any video link on the web and select "Play in StreamWatch" to start your streaming experience.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Content Rows */}
      <main className="relative z-30 -mt-32 pb-20 space-y-12">
        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <VideoRow
            title="Continue Watching"
            videos={continueWatching}
            onPlay={handlePlayVideo}
            showProgress
            userId={user?.uid}
          />
        )}

        {/* Recently Added / Completed */}
        {completed.length > 0 && (
          <VideoRow
            title="Watch Again"
            videos={completed}
            onPlay={handlePlayVideo}
            userId={user?.uid}
          />
        )}

        {/* All History */}
        {history.length > 0 && (
          <VideoRow
            title="My History"
            videos={history}
            onPlay={handlePlayVideo}
            showProgress
            userId={user?.uid}
          />
        )}

        {/* Empty State */}
        {!isHistoryLoading && history.length === 0 && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center py-20">
              <div className="w-24 h-24 mx-auto mb-6 bg-gray-800/50 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-sw-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">Your library is empty</h3>
              <p className="text-sw-gray max-w-md mx-auto">
                Find a video link anywhere on the web, right-click it, and select "Play in StreamWatch" to add it to your library.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-sm text-sw-gray">
            <p>&copy; 2024 StreamWatch</p>
            <div className="flex items-center gap-4">
              <button onClick={() => chrome.runtime.openOptionsPage()} className="hover:text-white transition-colors">
                Settings
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Video Row Component
interface VideoRowProps {
  title: string;
  videos: VideoHistory[];
  onPlay: (url: string) => void;
  showProgress?: boolean;
  userId?: string;
}

function VideoRow({ title, videos, onPlay, showProgress, userId }: VideoRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [videos]);

  return (
    <div className="relative group/row">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          {title}
          <svg className="w-5 h-5 text-sw-red opacity-0 group-hover/row:opacity-100 transform translate-x-0 group-hover/row:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </h3>
      </div>

      <div className="relative">
        {/* Left Arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-sw-dark to-transparent flex items-center justify-start pl-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <div className="w-10 h-10 bg-black/80 rounded-full flex items-center justify-center hover:bg-black transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </div>
          </button>
        )}

        {/* Right Arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-sw-dark to-transparent flex items-center justify-end pr-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <div className="w-10 h-10 bg-black/80 rounded-full flex items-center justify-center hover:bg-black transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-2 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 pb-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onPlay={onPlay}
              showProgress={showProgress}
              userId={userId}
            />
          ))}
        </div>
      </div>
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
  const [isHovered, setIsHovered] = useState(false);
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
      className="flex-shrink-0 w-[250px] group/card relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`relative rounded-md overflow-hidden bg-gray-800 cursor-pointer transition-all duration-300 ${
          isHovered ? 'transform scale-110 z-20 shadow-2xl' : ''
        }`}
        onClick={() => onPlay(video.url)}
      >
        {/* Thumbnail / Poster */}
        <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center overflow-hidden">
          {poster ? (
            <img
              src={poster}
              alt={info?.title || video.title}
              className="w-full h-full object-cover"
            />
          ) : isLoading ? (
            <div className="w-10 h-10 border-2 border-sw-red/30 border-t-sw-red rounded-full animate-spin" />
          ) : (
            <div className="w-16 h-16 bg-sw-red/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {showProgress && video.progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
            <div
              className="h-full bg-sw-red"
              style={{ width: `${video.progressPercent}%` }}
            />
          </div>
        )}

        {/* Hover Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute bottom-0 left-0 right-0 p-3">
            {/* Play Button */}
            <div className="flex items-center gap-2 mb-2">
              <button className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-white/90 transition-colors">
                <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
              <button className="w-9 h-9 border-2 border-gray-400 rounded-full flex items-center justify-center hover:border-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button className="w-9 h-9 border-2 border-gray-400 rounded-full flex items-center justify-center hover:border-white transition-colors ml-auto">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Info */}
            <p className="text-xs text-green-500 font-medium">
              {video.progressPercent >= 95 ? 'Watched' : `${video.progressPercent}% watched`}
            </p>
            <p className="text-xs text-sw-gray mt-0.5">
              {formatTime(video.duration)}
            </p>
          </div>
        </div>
      </div>

      {/* Title (below card) */}
      <p className={`text-sm mt-2 truncate transition-opacity ${isHovered ? 'opacity-0' : 'opacity-100'}`}>
        {info?.title || video.title}
      </p>
      {info?.year && !isHovered && (
        <p className="text-xs text-sw-gray">{info.year}</p>
      )}
    </div>
  );
}
