import { useState, useEffect, useMemo } from 'react';
import { Play, User, LogOut, PlayCircle, Layers, Clock, Database, Trash2, ChevronRight, Download, Palette } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSeries } from '@/hooks/useSeries';
import { useSettings, ACCENT_PALETTES, AccentColor } from '@/hooks/useSettings';
import { useRecentHistory } from '@/hooks/useRecentHistory';
import { formatTime } from '@/lib/utils';
import { dedupeHistory, toMillis } from '@/lib/library';
import CustomDropdown from '../components/CustomDropdown';

/** How many history records the settings page loads */
const HISTORY_LIMIT = 500;

export default function Settings() {
  const { user, isLoading: isAuthLoading, error: authError, signIn, logOut } = useAuth();
  const { allSeries, removeSeries, removeAllSeries, refresh: refreshSeries } = useSeries();
  const { settings, updateSettings, isLoading: isSettingsLoading } = useSettings();
  const { history, clearHistory, deleteVideo } = useRecentHistory(HISTORY_LIMIT);
  const [isReady, setIsReady] = useState(false);
  const [deletingSeriesId, setDeletingSeriesId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'history' | 'series' | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [deletingVideoUrl, setDeletingVideoUrl] = useState<string | null>(null);
  const [delayText, setDelayText] = useState<string | null>(null);

  // one row per video, even if it was played through several links
  const entries = useMemo(() => dedupeHistory(history), [history]);
  const historyCountLabel = history.length >= HISTORY_LIMIT ? `${entries.length}+` : String(entries.length);

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

  const handleConfirmedAction = async () => {
    setIsWorking(true);
    try {
      if (confirmAction === 'history') await clearHistory();
      if (confirmAction === 'series') await removeAllSeries();
    } finally {
      setIsWorking(false);
      setConfirmAction(null);
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

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      settings,
      history: history.map((v) => ({
        ...v,
        lastWatched: toMillis(v.lastWatched) ? new Date(toMillis(v.lastWatched)).toISOString() : null,
        createdAt: toMillis(v.createdAt) ? new Date(toMillis(v.createdAt)).toISOString() : null,
      })),
      series: allSeries.map((sr) => ({
        id: sr.id,
        name: sr.name,
        episodes: sr.episodes.map((ep) => ({
          ...ep,
          lastWatched: toMillis(ep.lastWatched) ? new Date(toMillis(ep.lastWatched)).toISOString() : null,
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `streamwatch-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const commitDelay = () => {
    if (delayText === null) return;
    const value = parseInt(delayText, 10);
    if (!isNaN(value)) updateSettings({ autoPlayDelay: Math.max(1, Math.min(30, value)) });
    setDelayText(null);
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

  const accentColors: { id: AccentColor; name: string }[] = [
    { id: 'red', name: 'Red' },
    { id: 'blue', name: 'Blue' },
    { id: 'green', name: 'Green' },
    { id: 'purple', name: 'Purple' },
  ];

  const playbackSpeedOptions = [
    { value: '0.5', label: '0.5x' },
    { value: '0.75', label: '0.75x' },
    { value: '1', label: '1.0x' },
    { value: '1.25', label: '1.25x' },
    { value: '1.5', label: '1.5x' },
    { value: '2', label: '2.0x' },
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
          <a
            href={chrome.runtime.getURL('src/home/home.html')}
            className="order-last ml-auto btn-secondary no-underline text-sm"
          >
            Open library
          </a>
          <div className="w-10 h-10 bg-sw-accent rounded-lg flex items-center justify-center">
            <Play size={18} fill="#f0ece8" stroke="none" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold leading-tight">StreamWatch</h1>
            <p className="font-body text-sm text-sw-text-secondary">Settings & Preferences</p>
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
                className="w-4 h-4 rounded accent-sw-accent"
              />
              <span className="font-body text-sm text-sw-text-secondary group-hover:text-sw-text transition-colors">Auto-resume from last position</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.autoPlayNext}
                onChange={(e) => updateSettings({ autoPlayNext: e.target.checked })}
                className="w-4 h-4 rounded accent-sw-accent"
              />
              <span className="font-body text-sm text-sw-text-secondary group-hover:text-sw-text transition-colors">Auto-play next episode</span>
            </label>

            <div className="pt-3 border-t border-sw-border">
              <label className="block font-body text-sm text-sw-text-secondary mb-2">
                Countdown before the next episode starts
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={delayText ?? String(settings.autoPlayDelay)}
                  onChange={(e) => setDelayText(e.target.value)}
                  onBlur={commitDelay}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  disabled={!settings.autoPlayNext}
                  min={1}
                  max={30}
                  className="input w-20 disabled:opacity-50"
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
                className="w-4 h-4 rounded accent-sw-accent"
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
                        className="btn-icon w-8 h-8 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-500/20 transition-all"
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
          <h2 className="font-heading text-base font-semibold mb-4 flex items-center gap-2">
            <Palette size={16} className="text-sw-text-muted" />
            Appearance
          </h2>
          <label className="block font-body text-sm text-sw-text-secondary mb-3">
            Accent color
          </label>
          <div className="flex gap-3">
            {accentColors.map((color) => (
              <button
                key={color.id}
                onClick={() => updateSettings({ accentColor: color.id })}
                style={{ backgroundColor: `rgb(${ACCENT_PALETTES[color.id][0]})` }}
                className={`w-10 h-10 rounded-full transition-all duration-200 hover:scale-110 active:scale-95 ${
                  settings.accentColor === color.id
                    ? 'ring-2 ring-sw-text ring-offset-2 ring-offset-sw-surface'
                    : 'opacity-60 hover:opacity-100'
                }`}
                title={color.name}
              />
            ))}
          </div>
          <p className="font-body text-xs text-sw-text-muted mt-3">Applies to the player, library and popup.</p>
        </section>

        {/* Watch History Section */}
        {user && (
          <section className="bg-sw-surface border border-sw-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-base font-semibold flex items-center gap-2">
                <Clock size={16} className="text-sw-text-muted" />
                Watch History
                <span className="font-body text-sm text-sw-text-muted font-normal">({historyCountLabel} videos)</span>
              </h2>
              <a
                href={chrome.runtime.getURL('src/home/home.html') + '#history'}
                className="font-body text-xs text-sw-accent hover:underline"
              >
                Open full history
              </a>
            </div>
            {entries.length === 0 ? (
              <div className="text-center py-6">
                <Clock size={48} className="mx-auto text-sw-text-muted mb-3" />
                <p className="font-body text-sw-text-secondary text-sm">No watch history</p>
                <p className="font-body text-sw-text-muted text-xs mt-1">Videos you watch will appear here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {entries.map(({ key, video, title, subtitle, finished }) => (
                  <div key={key} className="flex items-center gap-3 p-3 bg-sw-elevated border border-sw-border rounded-lg hover:bg-sw-elevated/80 transition-colors group">
                    <div className="relative w-16 h-10 bg-sw-bg rounded flex-shrink-0 overflow-hidden">
                      {video.posterUrl ? (
                        <img src={video.posterUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play size={14} className="text-sw-text-muted" fill="currentColor" stroke="none" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-sw-border">
                        <div className="h-full bg-sw-accent" style={{ width: `${video.progressPercent}%` }} />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-heading text-sm font-semibold text-sw-text truncate">
                        {title}{subtitle ? ` \u00b7 ${subtitle}` : ''}
                      </p>
                      <p className="font-body text-xs text-sw-text-muted">
                        {formatTime(video.duration)} • {video.progressPercent}% watched
                        {finished && <span className="text-green-500 ml-1">✓</span>}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDeleteVideo(video.url)}
                      disabled={deletingVideoUrl === video.url}
                      className="btn-icon w-8 h-8 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-500/20 transition-all disabled:opacity-50"
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
          </section>
        )}

        {/* Data Section */}
        <section className="bg-sw-surface border border-sw-border rounded-xl p-6 mb-6">
          <h2 className="font-heading text-base font-semibold mb-4 flex items-center gap-2">
            <Database size={16} className="text-sw-text-muted" />
            Data Management
          </h2>
          <div className="space-y-3">
            {([
              { id: 'history' as const, icon: Clock, label: 'Clear Watch History', count: entries.length, countLabel: historyCountLabel,
                question: 'Delete your entire watch history? Progress for every video will be lost.' },
              { id: 'series' as const, icon: Layers, label: 'Clear All Series', count: allSeries.length, countLabel: String(allSeries.length),
                question: `Delete all ${allSeries.length} series? Your watch history is kept.` },
            ]).map((row) => (
              confirmAction === row.id ? (
                <div key={row.id} className="py-3 px-4 bg-red-500/10 border border-red-900/40 rounded-lg flex items-center gap-3 animate-fade-in">
                  <p className="flex-1 font-body text-sm text-red-300">{row.question}</p>
                  <button
                    onClick={() => setConfirmAction(null)}
                    disabled={isWorking}
                    className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmedAction}
                    disabled={isWorking}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isWorking && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {isWorking ? 'Deleting' : 'Delete'}
                  </button>
                </div>
              ) : (
                <button
                  key={row.id}
                  onClick={() => setConfirmAction(row.id)}
                  disabled={!user || row.count === 0}
                  className="w-full py-3 px-4 bg-sw-elevated border border-sw-border rounded-lg hover:bg-sw-elevated/80 transition-all duration-200 font-body text-sm text-left flex items-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <row.icon size={16} className="text-sw-text-muted group-hover:text-sw-text-secondary transition-colors" />
                  <span className="flex-1 text-sw-text-secondary group-hover:text-sw-text transition-colors">
                    {row.label} {row.count > 0 && `(${row.countLabel})`}
                  </span>
                  <ChevronRight size={14} className="text-sw-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )
            ))}
            <button
              onClick={handleExport}
              disabled={!user}
              className="w-full py-3 px-4 bg-sw-elevated border border-sw-border rounded-lg hover:bg-sw-elevated/80 transition-all duration-200 font-body text-sm text-left flex items-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} className="text-sw-text-muted group-hover:text-sw-text-secondary transition-colors" />
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
          <p className="font-body text-xs text-sw-text-muted">Version {chrome.runtime.getManifest().version}</p>
        </div>
      </div>
    </div>
  );
}
