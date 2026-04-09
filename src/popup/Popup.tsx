import { useState, useEffect } from 'react';
import { Play, Settings, Home, User, LogOut, PlayCircle, Layers, Clock, Plus } from 'lucide-react';
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
    <div className={`w-80 bg-sw-bg text-sw-text font-body min-h-[420px] transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sw-border">
        <button
          onClick={() => {
            const homeUrl = chrome.runtime.getURL('src/home/home.html');
            chrome.tabs.create({ url: homeUrl });
          }}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="bg-sw-accent rounded-md w-6 h-6 flex items-center justify-center">
            <Play size={10} fill="#f0ece8" stroke="none" />
          </div>
          <h1 className="font-heading font-bold text-sm text-sw-text">StreamWatch</h1>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const homeUrl = chrome.runtime.getURL('src/home/home.html');
              chrome.tabs.create({ url: homeUrl });
            }}
            className="btn-icon w-8 h-8"
            title="Open StreamWatch"
          >
            <Home size={14} />
          </button>
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="btn-icon w-8 h-8"
            title="Settings"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Auth Section */}
      <div className="px-4 py-3 border-b border-sw-border">
        {authError && (
          <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded-lg text-xs text-red-400">
            {authError}
          </div>
        )}
        {user ? (
          <div className="flex items-center gap-3 p-2 bg-sw-surface border border-sw-border rounded-lg">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border-2 border-sw-border" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-sw-accent flex items-center justify-center text-sw-text font-bold text-sm">
                {user.displayName?.[0] || user.email?.[0] || 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-heading text-xs font-semibold text-sw-text truncate">{user.displayName || 'User'}</p>
              <p className="font-body text-[10px] text-sw-text-muted truncate">{user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              disabled={isAuthLoading}
              className="btn-icon w-8 h-8"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            disabled={isAuthLoading}
            className="btn-primary w-full flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAuthLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-sw-text/30 border-t-sw-text rounded-full animate-spin"></div>
                Signing in...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
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
      <div className="px-4 py-3 border-b border-sw-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-sm font-semibold text-sw-text flex items-center gap-2">
            <PlayCircle size={14} className="text-sw-text-muted" />
            Continue Watching
          </h2>
        </div>
        <div className="space-y-2">
          {isHistoryLoading ? (
            <div className="p-4 bg-sw-surface border border-sw-border rounded-lg text-center">
              <div className="w-5 h-5 border-2 border-sw-accent/30 border-t-sw-accent rounded-full animate-spin mx-auto"></div>
            </div>
          ) : !user ? (
            <div className="p-4 bg-sw-surface border border-sw-border rounded-lg text-center">
              <User size={24} className="mx-auto text-sw-text-muted mb-2" />
              <p className="font-body text-[10px] text-sw-text-muted">Sign in to sync history</p>
            </div>
          ) : history.length === 0 ? (
            <div className="p-4 bg-sw-surface border border-sw-border rounded-lg text-center">
              <PlayCircle size={24} className="mx-auto text-sw-text-muted mb-2" />
              <p className="font-body text-[10px] text-sw-text-muted">No videos yet</p>
              <p className="font-body text-[10px] text-sw-text-muted mt-1">Right-click a video link to start</p>
            </div>
          ) : (
            history.map((video) => (
              <button
                key={video.id}
                onClick={() => handlePlayVideo(video.url)}
                className="w-full bg-sw-surface border border-sw-border rounded-lg p-3 hover:bg-sw-elevated transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-sw-accent/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Play size={12} className="text-sw-accent" fill="currentColor" stroke="none" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-xs font-semibold text-sw-text truncate">{video.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-body text-[10px] text-sw-text-muted">{formatTime(video.progress)} / {formatTime(video.duration)}</span>
                      <span className="font-body text-[10px] text-sw-accent">{video.progressPercent}%</span>
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1 bg-sw-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sw-accent rounded-full"
                    style={{ width: `${video.progressPercent}%` }}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Series */}
      <div className="px-4 py-3 border-b border-sw-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-sm font-semibold text-sw-text flex items-center gap-2">
            <Layers size={14} className="text-sw-text-muted" />
            Series
          </h2>
        </div>
        <div className="space-y-2">
          <div className="p-4 bg-sw-surface border border-sw-border rounded-lg text-center">
            <Layers size={24} className="mx-auto text-sw-text-muted mb-2" />
            <p className="font-body text-[10px] text-sw-text-muted">No series yet</p>
          </div>
          <button className="w-full py-2.5 px-3 border border-dashed border-sw-border rounded-lg font-body text-[10px] text-sw-text-muted hover:border-sw-accent hover:text-sw-accent hover:bg-sw-accent/5 transition-all duration-200 flex items-center justify-center gap-2">
            <Plus size={12} />
            New Series
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-sw-border flex gap-2">
        <button
          onClick={() => {
            // Open settings page with history section
            chrome.runtime.openOptionsPage();
          }}
          className="btn-secondary text-xs flex-1 flex items-center justify-center gap-2"
        >
          <Clock size={12} />
          History
        </button>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="btn-secondary text-xs flex-1 flex items-center justify-center gap-2"
        >
          <Settings size={12} />
          Settings
        </button>
      </div>
    </div>
  );
}
