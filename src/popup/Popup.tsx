import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRecentHistory } from '@/hooks/useRecentHistory';
import { formatTime } from '@/lib/utils';
import { logger } from '@/lib/logger';

export default function Popup() {
  const { user, isLoading: isAuthLoading, error: authError, signIn, logOut } = useAuth();
  const { history, isLoading: isHistoryLoading } = useRecentHistory(3);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    logger.info('popup', 'Popup mounted');
    // Trigger fade-in animation
    setTimeout(() => setIsReady(true), 50);
  }, []);

  // Log state changes for debugging
  useEffect(() => {
    logger.debug('popup', 'State update', {
      isAuthLoading,
      isHistoryLoading,
      hasUser: !!user,
      historyCount: history.length,
      authError
    });
  }, [isAuthLoading, isHistoryLoading, user, history.length, authError]);

  const handlePlayVideo = (url: string) => {
    const playerUrl = chrome.runtime.getURL(`index.html?url=${encodeURIComponent(url)}`);
    chrome.tabs.create({ url: playerUrl });
  };

  const handleSignIn = async () => {
    await signIn();
  };

  const handleSignOut = async () => {
    await logOut();
  };

  return (
    <div className={`w-80 bg-gradient-to-b from-gray-900 to-sw-dark text-white min-h-[420px] transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800/50">
        <button
          onClick={() => {
            const homeUrl = chrome.runtime.getURL('src/home/home.html');
            chrome.tabs.create({ url: homeUrl });
          }}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 bg-sw-red/20 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <h1 className="text-lg font-bold">
            <span className="text-sw-red">Stream</span>Watch
          </h1>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const homeUrl = chrome.runtime.getURL('src/home/home.html');
              chrome.tabs.create({ url: homeUrl });
            }}
            className="p-2 hover:bg-gray-800 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
            title="Open StreamWatch"
          >
            <svg className="w-5 h-5 text-sw-gray hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="p-2 hover:bg-gray-800 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
            title="Settings"
          >
            <svg className="w-5 h-5 text-sw-gray hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Auth Section */}
      <div className="p-4 border-b border-gray-800/50">
        {authError && (
          <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded-lg text-xs text-red-400">
            {authError}
          </div>
        )}
        {user ? (
          <div className="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sw-red to-red-600 flex items-center justify-center text-white font-bold">
                {user.displayName?.[0] || user.email?.[0] || 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.displayName || 'User'}</p>
              <p className="text-xs text-sw-gray truncate">{user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              disabled={isAuthLoading}
              className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
              title="Sign out"
            >
              <svg className="w-4 h-4 text-sw-gray hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            disabled={isAuthLoading}
            className="w-full py-3 px-4 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAuthLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin"></div>
                Signing in...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </>
            )}
          </button>
        )}
      </div>

      {/* Continue Watching */}
      <div className="p-4 border-b border-gray-800/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-sw-light-gray uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Continue Watching
          </h2>
        </div>
        <div className="space-y-2">
          {isHistoryLoading ? (
            <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 text-center">
              <div className="w-6 h-6 border-2 border-sw-red/30 border-t-sw-red rounded-full animate-spin mx-auto"></div>
            </div>
          ) : !user ? (
            <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 text-center">
              <svg className="w-8 h-8 mx-auto text-sw-gray/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="text-sm text-sw-gray">Sign in to sync history</p>
            </div>
          ) : history.length === 0 ? (
            <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 text-center">
              <svg className="w-8 h-8 mx-auto text-sw-gray/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-sw-gray">No videos yet</p>
              <p className="text-xs text-sw-gray/70 mt-1">Right-click a video link to start</p>
            </div>
          ) : (
            history.map((video) => (
              <button
                key={video.id}
                onClick={() => handlePlayVideo(video.url)}
                className="w-full p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 hover:bg-gray-800/50 hover:border-gray-600/50 transition-all duration-200 text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-sw-red/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-sw-red/30 transition-colors">
                    <svg className="w-5 h-5 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{video.title}</p>
                    <div className="flex items-center gap-2 text-xs text-sw-gray mt-0.5">
                      <span>{formatTime(video.progress)} / {formatTime(video.duration)}</span>
                      <span className="text-sw-red">{video.progressPercent}%</span>
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sw-red rounded-full"
                    style={{ width: `${video.progressPercent}%` }}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Series */}
      <div className="p-4 border-b border-gray-800/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-sw-light-gray uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Series
          </h2>
        </div>
        <div className="space-y-2">
          <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 text-center">
            <svg className="w-8 h-8 mx-auto text-sw-gray/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-sw-gray">No series yet</p>
          </div>
          <button className="w-full py-2.5 px-3 border border-dashed border-gray-600 rounded-xl text-sm text-sw-light-gray hover:border-sw-red hover:text-sw-red hover:bg-sw-red/5 transition-all duration-200 flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Series
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 flex gap-2">
        <button
          onClick={() => {
            // Open settings page with history section
            chrome.runtime.openOptionsPage();
          }}
          className="flex-1 py-2.5 px-3 bg-gray-800/50 rounded-lg text-sm text-sw-light-gray hover:bg-gray-800 hover:text-white transition-all duration-200 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          History
        </button>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="flex-1 py-2.5 px-3 bg-gray-800/50 rounded-lg text-sm text-sw-light-gray hover:bg-gray-800 hover:text-white transition-all duration-200 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}
