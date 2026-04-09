import { useState, useEffect } from 'react';
import { Play, User, LogOut, PlayCircle, Layers, Clock, Database, Trash2, ChevronRight, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSeries } from '@/hooks/useSeries';
import { useSettings } from '@/hooks/useSettings';
import { useRecentHistory } from '@/hooks/useRecentHistory';
import { formatTime } from '@/lib/utils';
import CustomDropdown from '../components/CustomDropdown';

export default function Settings() {
  const { user, isLoading: isAuthLoading, error: authError, signIn, logOut } = useAuth();
  const { allSeries, removeSeries, refresh: refreshSeries } = useSeries();
  const { settings, updateSettings, isLoading: isSettingsLoading } = useSettings();
  const { history, clearHistory, deleteVideo } = useRecentHistory(50);
  const [isReady, setIsReady] = useState(false);
  const [deletingSeriesId, setDeletingSeriesId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [deletingVideoUrl, setDeletingVideoUrl] = useState<string | null>(null);

  const handleDeleteSeries = async (seriesId: string) => {
    setDeletingSeriesId(seriesId);
    try {
      await removeSeries(seriesId);
      await refreshSeries();
    } finally {
      setDeletingSeriesId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleClearHistory = async () => {
    setIsClearingHistory(true);
    try {
      await clearHistory();
    } finally {
      setIsClearingHistory(false);
      setShowClearHistoryConfirm(false);
    }
  };

  const handleDeleteVideo = async (videoUrl: string) => {
    setDeletingVideoUrl(videoUrl);
    try {
      await deleteVideo(videoUrl);
    } finally {
      setDeletingVideoUrl(null);
    }
  };

  useEffect(() => {
    setTimeout(() => setIsReady(true), 50);
  }, []);

  const handleSignIn = async () => {
    await signIn();
  };

  const handleSignOut = async () => {
    await logOut();
  };

  const accentColors = [
    { id: 'red' as const, bg: 'bg-sw-accent', name: 'Red' },
    { id: 'blue' as const, bg: 'bg-blue-500', name: 'Blue' },
    { id: 'green' as const, bg: 'bg-green-500', name: 'Green' },
    { id: 'purple' as const, bg: 'bg-purple-500', name: 'Purple' },
  ];

  const playbackSpeedOptions = [
    { value: '0.5', label: '0.5x' },
    { value: '0.75', label: '0.75x' },
    { value: '1', label: '1.0x' },
    { value: '1.25', label: '1.25x' },
    { value: '1.5', label: '1.5x' },
    { value: '2', label: '2.0x' },
  ];

  const themeOptions = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System default' },
  ];

  if (isSettingsLoading) {
    return (
      <div className="min-h-screen bg-sw-bg text-sw-text flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sw-accent/30 border-t-sw-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`bg-sw-bg min-h-screen text-sw-text font-body transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
      <div className="max-w-3xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <div className="w-10 h-10 bg-sw-accent rounded-lg flex items-center justify-center">
            <Play size={18} fill="#f0ece8" stroke="none" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold mb-6 leading-none">StreamWatch</h1>
            <p className="font-body text-sm text-sw-text-secondary -mt-5">Settings & Preferences</p>
          </div>
        </div>

        {/* Account Section */}
        <section className="bg-sw-surface border border-sw-border rounded-xl p-6 mb-6">
          <h2 className="font-heading text-base font-semibold mb-4 flex items-center gap-2">
            <User size={16} className="text-sw-text-muted" />
            Account
          </h2>
          {authError && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400">
              {authError}
            </div>
          )}
          {user ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full border-2 border-sw-border" />
                ) : (
                  <div className="w-12 h-12 rounded-full border-2 border-sw-border bg-sw-accent flex items-center justify-center text-sw-text font-bold text-lg">
                    {user.displayName?.[0] || user.email?.[0] || 'U'}
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-heading text-sm font-semibold text-sw-text">{user.displayName || 'User'}</p>
                  <p className="font-body text-sm text-sw-text-secondary">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  Synced
                </div>
              </div>
              <button
                onClick={handleSignOut}
                disabled={isAuthLoading}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
              >
                <LogOut size={14} />
                {isAuthLoading ? 'Signing out...' : 'Sign Out'}
              </button>

              <div className="mt-5 pt-5 border-t border-sw-border space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={settings.syncHistory}
                    onChange={(e) => updateSettings({ syncHistory: e.target.checked })}
                    className="w-4 h-4 rounded accent-[#B91C1C]"
                  />
                  <span className="font-body text-sm text-sw-text-secondary group-hover:text-sw-text transition-colors">Sync watch history across devices</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={settings.syncSeries}
                    onChange={(e) => updateSettings({ syncSeries: e.target.checked })}
                    className="w-4 h-4 rounded accent-[#B91C1C]"
                  />
                  <span className="font-body text-sm text-sw-text-secondary group-hover:text-sw-text transition-colors">Sync series across devices</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <User size={48} className="mx-auto text-sw-text-muted mb-3" />
              <p className="font-body text-sw-text-secondary mb-4 text-sm">
                Sign in to sync your watch history and series across devices.
              </p>
              <button
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="btn-primary flex items-center justify-center gap-3 mx-auto disabled:opacity-50"
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
            </div>
          )}
        </section>

        {/* Playback Section */}
        <section className="bg-sw-surface border border-sw-border rounded-xl p-6 mb-6">
          <h2 className="font-heading text-base font-semibold mb-4 flex items-center gap-2">
            <PlayCircle size={16} className="text-sw-text-muted" />
            Playback
          </h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.autoResume}
                onChange={(e) => updateSettings({ autoResume: e.target.checked })}
                className="w-4 h-4 rounded accent-[#B91C1C]"
              />
              <span className="font-body text-sm text-sw-text-secondary group-hover:text-sw-text transition-colors">Auto-resume from last position</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.autoPlayNext}
                onChange={(e) => updateSettings({ autoPlayNext: e.target.checked })}
                className="w-4 h-4 rounded accent-[#B91C1C]"
              />
              <span className="font-body text-sm text-sw-text-secondary group-hover:text-sw-text transition-colors">Auto-play next episode</span>
            </label>

            <div className="pt-3 border-t border-sw-border">
              <label className="block font-body text-sm text-sw-text-secondary mb-2">
                Autoplay delay
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings.autoPlayDelay}
                  onChange={(e) => updateSettings({ autoPlayDelay: Math.max(1, Math.min(30, parseInt(e.target.value) || 5)) })}
                  min={1}
                  max={30}
                  className="input w-20"
                />
                <span className="font-body text-sm text-sw-text-muted">seconds</span>
              </div>
            </div>

            <div>
              <label className="block font-body text-sm text-sw-text-secondary mb-2">
                Default playback speed
              </label>
              <CustomDropdown
                value={String(settings.defaultPlaybackSpeed)}
                onChange={(val) => updateSettings({ defaultPlaybackSpeed: parseFloat(val) })}
                options={playbackSpeedOptions}
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.rememberPlaybackSpeed}
                onChange={(e) => updateSettings({ rememberPlaybackSpeed: e.target.checked })}
                className="w-4 h-4 rounded accent-[#B91C1C]"
              />
              <span className="font-body text-sm text-sw-text-secondary group-hover:text-sw-text transition-colors">Remember playback speed per video</span>
            </label>
          </div>
        </section>

        {/* Series Section */}
        <section className="bg-sw-surface border border-sw-border rounded-xl p-6 mb-6">
          <h2 className="font-heading text-base font-semibold mb-4 flex items-center gap-2">
            <Layers size={16} className="text-sw-text-muted" />
            Series
          </h2>
          {allSeries.length === 0 ? (
            <div className="text-center py-6">
              <Layers size={48} className="mx-auto text-sw-text-muted mb-3" />
              <p className="font-body text-sw-text-secondary text-sm">No series created yet</p>
              <p className="font-body text-sw-text-muted text-xs mt-1">Create a series from the player to organize your videos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allSeries.map((series) => (
                <div key={series.id} className="relative">
                  <div className="flex items-center gap-3 p-3 bg-sw-elevated rounded-lg hover:bg-sw-elevated/80 transition-colors group border border-sw-border">
                    <div className="w-10 h-10 bg-sw-accent/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Play size={14} className="text-sw-accent" fill="currentColor" stroke="none" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading text-sm font-semibold text-sw-text truncate">{series.name}</p>
                      <p className="font-body text-xs text-sw-text-muted">
                        {series.episodes.length} episode{series.episodes.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {confirmDeleteId === series.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingSeriesId === series.id}
                          className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeleteSeries(series.id)}
                          disabled={deletingSeriesId === series.id}
                          className="btn-secondary text-xs text-red-400 border-red-900/50 hover:bg-red-900/20 px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
                        >
                          {deletingSeriesId === series.id ? (
                            <>
                              <div className="w-3 h-3 border-2 border-sw-text/30 border-t-sw-text rounded-full animate-spin" />
                              Deleting
                            </>
                          ) : (
                            'Delete'
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(series.id)}
                        className="btn-icon w-8 h-8 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                        title="Delete series"
                      >
                        <Trash2 size={14} className="text-sw-text-muted hover:text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Appearance Section */}
        <section className="bg-sw-surface border border-sw-border rounded-xl p-6 mb-6">
          <h2 className="font-heading text-base font-semibold mb-4">
            Appearance
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block font-body text-sm text-sw-text-secondary mb-2">Theme</label>
              <CustomDropdown
                value={settings.theme}
                onChange={(val) => updateSettings({ theme: val as 'dark' | 'light' | 'system' })}
                options={themeOptions}
              />
            </div>
            <div>
              <label className="block font-body text-sm text-sw-text-secondary mb-3">
                Player accent color
              </label>
              <div className="flex gap-3">
                {accentColors.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => updateSettings({ accentColor: color.id })}
                    className={`w-10 h-10 rounded-full ${color.bg} transition-all duration-200 hover:scale-110 active:scale-95 ${
                      settings.accentColor === color.id
                        ? 'ring-2 ring-sw-text ring-offset-2 ring-offset-sw-surface'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Watch History Section */}
        {user && (
          <section className="bg-sw-surface border border-sw-border rounded-xl p-6 mb-6">
            <h2 className="font-heading text-base font-semibold mb-4 flex items-center gap-2">
              <Clock size={16} className="text-sw-text-muted" />
              Watch History
              <span className="font-body text-sm text-sw-text-muted font-normal">({history.length} videos)</span>
            </h2>
            {history.length === 0 ? (
              <div className="text-center py-6">
                <Clock size={48} className="mx-auto text-sw-text-muted mb-3" />
                <p className="font-body text-sw-text-secondary text-sm">No watch history</p>
                <p className="font-body text-sw-text-muted text-xs mt-1">Videos you watch will appear here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.map((video) => (
                  <div key={video.id} className="flex items-center gap-3 p-3 bg-sw-elevated border border-sw-border rounded-lg hover:bg-sw-elevated/80 transition-colors group">
                    {/* Thumbnail / Progress indicator */}
                    <div className="relative w-16 h-10 bg-sw-bg rounded flex-shrink-0 overflow-hidden">
                      {video.posterUrl ? (
                        <img src={video.posterUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play size={14} className="text-sw-text-muted" fill="currentColor" stroke="none" />
                        </div>
                      )}
                      {/* Progress bar */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-sw-border">
                        <div
                          className="h-full bg-sw-accent"
                          style={{ width: `${video.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Video info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-heading text-sm font-semibold text-sw-text truncate">
                        {video.mediaTitle || video.title}
                      </p>
                      <p className="font-body text-xs text-sw-text-muted">
                        {formatTime(video.duration)} • {video.progressPercent}% watched
                        {video.completed && <span className="text-green-500 ml-1">✓</span>}
                      </p>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteVideo(video.url)}
                      disabled={deletingVideoUrl === video.url}
                      className="btn-icon w-8 h-8 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all disabled:opacity-50"
                      title="Remove from history"
                    >
                      {deletingVideoUrl === video.url ? (
                        <div className="w-4 h-4 border-2 border-sw-text-muted/30 border-t-sw-text-muted rounded-full animate-spin" />
                      ) : (
                        <Trash2 size={14} className="text-sw-text-muted hover:text-red-400" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Clear all button at bottom */}
            {history.length > 0 && (
              <div className="mt-4 pt-4 border-t border-sw-border">
                {showClearHistoryConfirm ? (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 font-body text-sm text-yellow-500">Clear all {history.length} videos?</p>
                    <button
                      onClick={() => setShowClearHistoryConfirm(false)}
                      disabled={isClearingHistory}
                      className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleClearHistory}
                      disabled={isClearingHistory}
                      className="btn-secondary text-xs text-red-400 border-red-900/50 hover:bg-red-900/20 px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
                    >
                      {isClearingHistory ? (
                        <>
                          <div className="w-3 h-3 border-2 border-sw-text/30 border-t-sw-text rounded-full animate-spin" />
                          Clearing...
                        </>
                      ) : (
                        'Clear All'
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowClearHistoryConfirm(true)}
                    className="btn-ghost text-sm text-red-400 hover:text-red-300"
                  >
                    Clear all history
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* Data Section */}
        <section className="bg-sw-surface border border-sw-border rounded-xl p-6 mb-6">
          <h2 className="font-heading text-base font-semibold mb-4 flex items-center gap-2">
            <Database size={16} className="text-sw-text-muted" />
            Data Management
          </h2>
          <div className="space-y-3">
            <button
              onClick={() => setShowClearHistoryConfirm(true)}
              disabled={!user || history.length === 0}
              className="w-full py-3 px-4 bg-sw-elevated border border-sw-border rounded-lg hover:bg-sw-elevated/80 transition-all duration-200 font-body text-sm text-left flex items-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Clock size={16} className="text-sw-text-muted group-hover:text-sw-text-secondary transition-colors" />
              <span className="flex-1 text-sw-text-secondary group-hover:text-sw-text transition-colors">
                Clear Watch History {history.length > 0 && `(${history.length})`}
              </span>
              <ChevronRight size={14} className="text-sw-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button className="w-full py-3 px-4 bg-sw-elevated border border-sw-border rounded-lg hover:bg-sw-elevated/80 transition-all duration-200 font-body text-sm text-left flex items-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed" disabled={allSeries.length === 0}>
              <Layers size={16} className="text-sw-text-muted group-hover:text-sw-text-secondary transition-colors" />
              <span className="flex-1 text-sw-text-secondary group-hover:text-sw-text transition-colors">
                Clear All Series {allSeries.length > 0 && `(${allSeries.length})`}
              </span>
              <ChevronRight size={14} className="text-sw-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button className="w-full py-3 px-4 bg-sw-elevated border border-sw-border rounded-lg hover:bg-sw-elevated/80 transition-all duration-200 font-body text-sm text-left flex items-center gap-3 group">
              <Upload size={16} className="text-sw-text-muted group-hover:text-sw-text-secondary transition-colors" />
              <span className="flex-1 text-sw-text-secondary group-hover:text-sw-text transition-colors">Export Data as JSON</span>
              <ChevronRight size={14} className="text-sw-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center py-6 border-t border-sw-border">
          <div className="flex items-center justify-center gap-2 text-sw-text-muted text-sm mb-2">
            <div className="bg-sw-accent rounded w-5 h-5 flex items-center justify-center">
              <Play size={10} fill="#f0ece8" stroke="none" />
            </div>
            <span className="font-heading font-semibold text-sw-text">StreamWatch</span>
          </div>
          <p className="font-body text-xs text-sw-text-muted">Version 1.0.0</p>
        </div>
      </div>
    </div>
  );
}
