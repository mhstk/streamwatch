import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSeries } from '@/hooks/useSeries';
import { useSettings } from '@/hooks/useSettings';

export default function Settings() {
  const { user, isLoading: isAuthLoading, error: authError, signIn, logOut } = useAuth();
  const { allSeries, removeSeries, refresh: refreshSeries } = useSeries();
  const { settings, updateSettings, isLoading: isSettingsLoading } = useSettings();
  const [isReady, setIsReady] = useState(false);
  const [deletingSeriesId, setDeletingSeriesId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    { id: 'red' as const, bg: 'bg-sw-red', name: 'Red' },
    { id: 'blue' as const, bg: 'bg-blue-500', name: 'Blue' },
    { id: 'green' as const, bg: 'bg-green-500', name: 'Green' },
    { id: 'purple' as const, bg: 'bg-purple-500', name: 'Purple' },
  ];

  if (isSettingsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-sw-dark text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sw-red/30 border-t-sw-red rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-b from-gray-900 to-sw-dark text-white transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <div className="w-12 h-12 bg-sw-red/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              <span className="text-sw-red">Stream</span>Watch
            </h1>
            <p className="text-sm text-sw-gray">Settings & Preferences</p>
          </div>
        </div>

        {/* Account Section */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-sw-light-gray uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Account
          </h2>
          <div className="bg-gray-800/30 rounded-xl p-5 border border-gray-700/30">
            {authError && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400">
                {authError}
              </div>
            )}
            {user ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sw-red to-red-600 flex items-center justify-center text-white font-bold text-lg">
                      {user.displayName?.[0] || user.email?.[0] || 'U'}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-white">{user.displayName || 'User'}</p>
                    <p className="text-sm text-sw-gray">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Synced
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={isAuthLoading}
                  className="py-2.5 px-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium disabled:opacity-50"
                >
                  {isAuthLoading ? 'Signing out...' : 'Sign Out'}
                </button>

                <div className="mt-5 pt-5 border-t border-gray-700/50 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={settings.syncHistory}
                      onChange={(e) => updateSettings({ syncHistory: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-sw-red focus:ring-sw-red focus:ring-offset-gray-800"
                    />
                    <span className="text-sm text-sw-light-gray group-hover:text-white transition-colors">Sync watch history across devices</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={settings.syncSeries}
                      onChange={(e) => updateSettings({ syncSeries: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-sw-red focus:ring-sw-red focus:ring-offset-gray-800"
                    />
                    <span className="text-sm text-sw-light-gray group-hover:text-white transition-colors">Sync series across devices</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <svg className="w-12 h-12 mx-auto text-sw-gray/50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <p className="text-sw-gray mb-4 text-sm">
                  Sign in to sync your watch history and series across devices.
                </p>
                <button
                  onClick={handleSignIn}
                  disabled={isAuthLoading}
                  className="py-3 px-6 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 mx-auto shadow-lg shadow-black/20 disabled:opacity-50"
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
              </div>
            )}
          </div>
        </section>

        {/* Playback Section */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-sw-light-gray uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Playback
          </h2>
          <div className="bg-gray-800/30 rounded-xl p-5 border border-gray-700/30 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.autoResume}
                onChange={(e) => updateSettings({ autoResume: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-sw-red focus:ring-sw-red focus:ring-offset-gray-800"
              />
              <span className="text-sm text-sw-light-gray group-hover:text-white transition-colors">Auto-resume from last position</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.autoPlayNext}
                onChange={(e) => updateSettings({ autoPlayNext: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-sw-red focus:ring-sw-red focus:ring-offset-gray-800"
              />
              <span className="text-sm text-sw-light-gray group-hover:text-white transition-colors">Auto-play next episode</span>
            </label>

            <div className="pt-3 border-t border-gray-700/50">
              <label className="block text-sm text-sw-light-gray mb-2">
                Autoplay delay
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings.autoPlayDelay}
                  onChange={(e) => updateSettings({ autoPlayDelay: Math.max(1, Math.min(30, parseInt(e.target.value) || 5)) })}
                  min={1}
                  max={30}
                  className="w-20 bg-gray-700/50 border border-gray-600/50 rounded-lg p-3 text-sm focus:border-sw-red focus:ring-1 focus:ring-sw-red transition-colors"
                />
                <span className="text-sm text-sw-gray">seconds</span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-sw-light-gray mb-2">
                Default playback speed
              </label>
              <select
                value={settings.defaultPlaybackSpeed}
                onChange={(e) => updateSettings({ defaultPlaybackSpeed: parseFloat(e.target.value) })}
                className="w-32 bg-gray-700/50 border border-gray-600/50 rounded-lg p-3 text-sm focus:border-sw-red focus:ring-1 focus:ring-sw-red transition-colors cursor-pointer"
              >
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>
            </div>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.rememberPlaybackSpeed}
                onChange={(e) => updateSettings({ rememberPlaybackSpeed: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-sw-red focus:ring-sw-red focus:ring-offset-gray-800"
              />
              <span className="text-sm text-sw-light-gray group-hover:text-white transition-colors">Remember playback speed per video</span>
            </label>
          </div>
        </section>

        {/* Series Section */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-sw-light-gray uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Series
          </h2>
          <div className="bg-gray-800/30 rounded-xl p-5 border border-gray-700/30">
            {allSeries.length === 0 ? (
              <div className="text-center py-6">
                <svg className="w-12 h-12 mx-auto text-sw-gray/50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
                <p className="text-sw-gray text-sm">No series created yet</p>
                <p className="text-sw-gray/70 text-xs mt-1">Create a series from the player to organize your videos</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allSeries.map((series) => (
                  <div key={series.id} className="relative">
                    <div className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors group">
                      <div className="w-10 h-10 bg-sw-red/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{series.name}</p>
                        <p className="text-xs text-sw-gray">
                          {series.episodes.length} episode{series.episodes.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {confirmDeleteId === series.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={deletingSeriesId === series.id}
                            className="px-3 py-1.5 text-xs bg-gray-600 rounded hover:bg-gray-500 transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDeleteSeries(series.id)}
                            disabled={deletingSeriesId === series.id}
                            className="px-3 py-1.5 text-xs bg-red-600 rounded hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {deletingSeriesId === series.id ? (
                              <>
                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                          className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-lg transition-all"
                          title="Delete series"
                        >
                          <svg className="w-4 h-4 text-sw-gray hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Appearance Section */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-sw-light-gray uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            Appearance
          </h2>
          <div className="bg-gray-800/30 rounded-xl p-5 border border-gray-700/30 space-y-5">
            <div>
              <label className="block text-sm text-sw-light-gray mb-2">Theme</label>
              <select
                value={settings.theme}
                onChange={(e) => updateSettings({ theme: e.target.value as 'dark' | 'light' | 'system' })}
                className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg p-3 text-sm focus:border-sw-red focus:ring-1 focus:ring-sw-red transition-colors cursor-pointer"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System default</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-sw-light-gray mb-3">
                Player accent color
              </label>
              <div className="flex gap-3">
                {accentColors.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => updateSettings({ accentColor: color.id })}
                    className={`w-10 h-10 rounded-full ${color.bg} transition-all duration-200 hover:scale-110 active:scale-95 ${
                      settings.accentColor === color.id
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Data Section */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-sw-light-gray uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            Data Management
          </h2>
          <div className="bg-gray-800/30 rounded-xl p-5 border border-gray-700/30 space-y-3">
            <button className="w-full py-3 px-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium text-left flex items-center gap-3 group">
              <svg className="w-5 h-5 text-sw-gray group-hover:text-sw-light-gray transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="flex-1 text-sw-light-gray group-hover:text-white transition-colors">Clear Watch History</span>
              <svg className="w-4 h-4 text-sw-gray opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button className="w-full py-3 px-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium text-left flex items-center gap-3 group">
              <svg className="w-5 h-5 text-sw-gray group-hover:text-sw-light-gray transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="flex-1 text-sw-light-gray group-hover:text-white transition-colors">Clear All Series</span>
              <svg className="w-4 h-4 text-sw-gray opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button className="w-full py-3 px-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm font-medium text-left flex items-center gap-3 group">
              <svg className="w-5 h-5 text-sw-gray group-hover:text-sw-light-gray transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="flex-1 text-sw-light-gray group-hover:text-white transition-colors">Export Data as JSON</span>
              <svg className="w-4 h-4 text-sw-gray opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center py-6 border-t border-gray-800/50">
          <div className="flex items-center justify-center gap-2 text-sw-gray text-sm mb-2">
            <div className="w-5 h-5 bg-sw-red/20 rounded flex items-center justify-center">
              <svg className="w-3 h-3 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <span><span className="text-sw-red">Stream</span>Watch</span>
          </div>
          <p className="text-xs text-sw-gray/70">Version 1.0.0</p>
        </div>
      </div>
    </div>
  );
}
