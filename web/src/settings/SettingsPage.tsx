// Settings (web version of ../src/settings/Settings.tsx): account, playback, series, appearance,
// watch history and data management, with the same confirmations. Single column; on phones the
// controls are full width with 44px+ touch targets and nothing depends on hover.
import { useState, useMemo, type ReactNode } from 'react';
import {
  Play, User, LogOut, PlayCircle, Layers, Clock, Database, Trash2, ChevronRight, ChevronDown, Download, Palette, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSeries } from '@/hooks/useSeries';
import { useSettings, ACCENT_PALETTES, type AccentColor } from '@/hooks/useSettings';
import { useRecentHistory } from '@/hooks/useRecentHistory';
import { formatTime } from '@/lib/utils';
import { dedupeHistory, toMillis } from '@/lib/library';
import CustomDropdown from '@/components/CustomDropdown';
import { Link } from '~/router';
import { useMediaQuery, DESKTOP_QUERY } from '~/home/hooks';
import { version } from '../../../package.json';

/** How many history records the settings page loads */
const HISTORY_LIMIT = 500;

const ACCENT_COLORS: { id: AccentColor; name: string }[] = [
  { id: 'red', name: 'Red' },
  { id: 'blue', name: 'Blue' },
  { id: 'green', name: 'Green' },
  { id: 'purple', name: 'Purple' },
];

const SPEED_OPTIONS = [
  { value: '0.5', label: '0.5x' },
  { value: '0.75', label: '0.75x' },
  { value: '1', label: '1.0x' },
  { value: '1.25', label: '1.25x' },
  { value: '1.5', label: '1.5x' },
  { value: '2', label: '2.0x' },
];

/** Shows on hover with a mouse; always visible on touch / phones */
const HOVER_REVEAL = 'opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 max-md:opacity-100';

function Spinner({ className = '' }: { className?: string }) {
  return <div className={`border-2 rounded-full animate-spin ${className}`} />;
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function Section({ icon, title, extra, children }: { icon: ReactNode; title: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-sw-surface border border-sw-border rounded-xl p-6 max-md:p-4 mb-6 max-md:mb-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-heading text-base font-semibold flex items-center gap-2 min-w-0">
          {icon}
          {title}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group max-md:min-h-[44px] [@media(pointer:coarse)]:min-h-[44px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 max-md:w-5 max-md:h-5 rounded accent-sw-accent flex-shrink-0"
      />
      <span className="font-body text-sm text-sw-text-secondary group-hover:text-sw-text transition-colors">{children}</span>
    </label>
  );
}

/** Inline "are you sure" row with Cancel / Delete, as in the extension */
function ConfirmRow({ question, working, onCancel, onConfirm }: { question: string; working: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="py-3 px-4 bg-red-500/10 border border-red-900/40 rounded-lg flex items-center gap-3 max-md:flex-col max-md:items-stretch animate-fade-in">
      <p className="flex-1 font-body text-sm text-red-300">{question}</p>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onCancel} disabled={working} className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50 max-md:flex-1 max-md:min-h-[44px] max-md:text-sm">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={working}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 max-md:flex-1 max-md:min-h-[44px] max-md:text-sm"
        >
          {working && <Spinner className="w-3 h-3 border-white/30 border-t-white" />}
          {working ? 'Deleting' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, isLoading: isAuthLoading, error: authError, signIn, logOut } = useAuth();
  const { allSeries, removeSeries, removeAllSeries, refresh: refreshSeries } = useSeries();
  const { settings, updateSettings, isLoading: isSettingsLoading } = useSettings();
  const { history, clearHistory, deleteVideo } = useRecentHistory(HISTORY_LIMIT);
  const desktop = useMediaQuery(DESKTOP_QUERY);
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

  if (isSettingsLoading) {
    return (
      <div className="min-h-[100dvh] bg-sw-bg text-sw-text flex items-center justify-center">
        <Spinner className="w-8 h-8 border-sw-accent/30 border-t-sw-accent" />
      </div>
    );
  }

  const dataRowClass =
    'w-full py-3 px-4 max-md:min-h-[48px] bg-sw-elevated border border-sw-border rounded-lg hover:bg-sw-elevated/80 transition-all duration-200 font-body text-sm text-left flex items-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="bg-sw-bg min-h-[100dvh] text-sw-text font-body animate-fade-in">
      {/* Phones: compact sticky top bar with a way back to the library */}
      <header className="md:hidden sticky top-0 z-40 glass-light bg-[rgba(22,18,16,0.85)] border-b border-sw-border pt-safe">
        <div className="flex items-center gap-2 px-gutter h-14">
          <Link to="/" className="btn-icon w-11 h-11 -ml-1" aria-label="Back to library">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="font-heading text-lg font-bold">Settings</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-8 max-md:px-gutter max-md:pt-4 max-md:pb-[calc(24px+env(safe-area-inset-bottom,0px))]">
        {/* Header (as in the extension) */}
        <div className="mb-8 flex items-center gap-4 max-md:hidden">
          <Link to="/" className="order-last ml-auto btn-secondary no-underline text-sm">
            Open library
          </Link>
          <div className="w-10 h-10 bg-sw-accent rounded-lg flex items-center justify-center">
            <Play size={18} fill="#f0ece8" stroke="none" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold leading-tight">StreamWatch</h1>
            <p className="font-body text-sm text-sw-text-secondary">Settings & Preferences</p>
          </div>
        </div>

        {/* Account */}
        <Section icon={<User size={16} className="text-sw-text-muted" />} title="Account">
          {authError && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400">{authError}</div>
          )}
          {user ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full border-2 border-sw-border flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full border-2 border-sw-border bg-sw-accent flex items-center justify-center text-sw-text font-bold text-lg flex-shrink-0">
                    {user.displayName?.[0] || user.email?.[0] || 'U'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-sm font-semibold text-sw-text truncate">{user.displayName || 'User'}</p>
                  <p className="font-body text-sm text-sw-text-secondary truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-green-400 flex-shrink-0">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Synced
                </div>
              </div>
              <button
                onClick={() => void logOut()}
                disabled={isAuthLoading}
                className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50 max-md:w-full max-md:min-h-[44px]"
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
                onClick={() => void signIn()}
                disabled={isAuthLoading}
                className="btn-primary flex items-center justify-center gap-3 mx-auto disabled:opacity-50 max-md:w-full max-md:min-h-[44px]"
              >
                {isAuthLoading ? (
                  <>
                    <Spinner className="w-4 h-4 border-sw-text/30 border-t-sw-text" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    Sign in with Google
                  </>
                )}
              </button>
            </div>
          )}
        </Section>

        {/* Playback */}
        <Section icon={<PlayCircle size={16} className="text-sw-text-muted" />} title="Playback">
          <div className="space-y-4 max-md:space-y-2">
            <Checkbox checked={settings.autoResume} onChange={(v) => updateSettings({ autoResume: v })}>
              Auto-resume from last position
            </Checkbox>
            <Checkbox checked={settings.autoPlayNext} onChange={(v) => updateSettings({ autoPlayNext: v })}>
              Auto-play next episode
            </Checkbox>

            <div className="pt-3 border-t border-sw-border">
              <label htmlFor="sw-autoplay-delay" className="block font-body text-sm text-sw-text-secondary mb-2">
                Countdown before the next episode starts
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="sw-autoplay-delay"
                  type="number"
                  inputMode="numeric"
                  value={delayText ?? String(settings.autoPlayDelay)}
                  onChange={(e) => setDelayText(e.target.value)}
                  onBlur={commitDelay}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  disabled={!settings.autoPlayNext}
                  min={1}
                  max={30}
                  className="input w-20 max-md:w-24 max-md:min-h-[44px] disabled:opacity-50"
                />
                <span className="font-body text-sm text-sw-text-muted">seconds</span>
              </div>
            </div>

            <div className="max-md:pt-2">
              <label htmlFor="sw-speed" className="block font-body text-sm text-sw-text-secondary mb-2">
                Default playback speed
              </label>
              {desktop ? (
                <CustomDropdown
                  value={String(settings.defaultPlaybackSpeed)}
                  onChange={(val) => updateSettings({ defaultPlaybackSpeed: parseFloat(val) })}
                  options={SPEED_OPTIONS}
                />
              ) : (
                // touch: the system picker
                <div className="relative">
                  <select
                    id="sw-speed"
                    value={String(settings.defaultPlaybackSpeed)}
                    onChange={(e) => updateSettings({ defaultPlaybackSpeed: parseFloat(e.target.value) })}
                    className="input w-full min-h-[44px] appearance-none pr-10 cursor-pointer"
                  >
                    {SPEED_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-sw-text-muted pointer-events-none" />
                </div>
              )}
            </div>

            <Checkbox checked={settings.rememberPlaybackSpeed} onChange={(v) => updateSettings({ rememberPlaybackSpeed: v })}>
              Remember playback speed per video
            </Checkbox>
          </div>
        </Section>

        {/* Series */}
        <Section icon={<Layers size={16} className="text-sw-text-muted" />} title="Series">
          {allSeries.length === 0 ? (
            <div className="text-center py-6">
              <Layers size={48} className="mx-auto text-sw-text-muted mb-3" />
              <p className="font-body text-sw-text-secondary text-sm">No series created yet</p>
              <p className="font-body text-sw-text-muted text-xs mt-1">Create a series from the player to organize your videos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allSeries.map((series) => (
                <div
                  key={series.id}
                  className="flex items-center gap-3 p-3 max-md:p-2.5 bg-sw-elevated rounded-lg hover:bg-sw-elevated/80 transition-colors group border border-sw-border max-md:flex-wrap"
                >
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
                    <div className="flex items-center gap-2 max-md:w-full">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deletingSeriesId === series.id}
                        className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50 max-md:flex-1 max-md:min-h-[44px] max-md:text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDeleteSeries(series.id)}
                        disabled={deletingSeriesId === series.id}
                        className="btn-secondary text-xs text-red-400 border-red-900/50 hover:bg-red-900/20 px-3 py-1.5 flex items-center justify-center gap-1 disabled:opacity-50 max-md:flex-1 max-md:min-h-[44px] max-md:text-sm"
                      >
                        {deletingSeriesId === series.id ? (
                          <>
                            <Spinner className="w-3 h-3 border-sw-text/30 border-t-sw-text" />
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
                      className={`btn-icon w-8 h-8 max-md:w-11 max-md:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 flex-shrink-0 hover:bg-red-500/20 transition-all ${HOVER_REVEAL}`}
                      title="Delete series"
                      aria-label={`Delete series ${series.name}`}
                    >
                      <Trash2 size={14} className="text-sw-text-muted hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Appearance */}
        <Section icon={<Palette size={16} className="text-sw-text-muted" />} title="Appearance">
          <p className="block font-body text-sm text-sw-text-secondary mb-3">Accent color</p>
          <div className="flex gap-3 max-md:gap-4" role="radiogroup" aria-label="Accent color">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.id}
                role="radio"
                aria-checked={settings.accentColor === color.id}
                aria-label={color.name}
                onClick={() => updateSettings({ accentColor: color.id })}
                style={{ backgroundColor: `rgb(${ACCENT_PALETTES[color.id][0]})` }}
                className={`w-10 h-10 max-md:w-11 max-md:h-11 rounded-full transition-all duration-200 hover:scale-110 active:scale-95 ${
                  settings.accentColor === color.id
                    ? 'ring-2 ring-sw-text ring-offset-2 ring-offset-sw-surface'
                    : 'opacity-60 hover:opacity-100'
                }`}
                title={color.name}
              />
            ))}
          </div>
          <p className="font-body text-xs text-sw-text-muted mt-3">Applies to the player and library on this device.</p>
        </Section>

        {/* Watch history */}
        {user && (
          <Section
            icon={<Clock size={16} className="text-sw-text-muted flex-shrink-0" />}
            title={
              <span className="truncate">
                Watch History{' '}
                <span className="font-body text-sm text-sw-text-muted font-normal">({historyCountLabel} videos)</span>
              </span>
            }
            extra={
              <Link to="/history" className="font-body text-xs text-sw-accent hover:underline flex-shrink-0 max-md:py-3 max-md:-my-3">
                Open full history
              </Link>
            }
          >
            {entries.length === 0 ? (
              <div className="text-center py-6">
                <Clock size={48} className="mx-auto text-sw-text-muted mb-3" />
                <p className="font-body text-sw-text-secondary text-sm">No watch history</p>
                <p className="font-body text-sw-text-muted text-xs mt-1">Videos you watch will appear here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1 max-md:pr-0 overscroll-contain">
                {entries.map(({ key, video, title, subtitle, finished }) => (
                  <div
                    key={key}
                    className="flex items-center gap-3 p-3 max-md:p-2 max-md:pl-2.5 bg-sw-elevated border border-sw-border rounded-lg hover:bg-sw-elevated/80 transition-colors group"
                  >
                    <div className="relative w-16 h-10 bg-sw-bg rounded flex-shrink-0 overflow-hidden">
                      {video.posterUrl ? (
                        <img src={video.posterUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
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
                        {title}{subtitle ? ` · ${subtitle}` : ''}
                      </p>
                      <p className="font-body text-xs text-sw-text-muted truncate">
                        {formatTime(video.duration)} • {video.progressPercent}% watched
                        {finished && <span className="text-green-500 ml-1">✓</span>}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDeleteVideo(video.url)}
                      disabled={deletingVideoUrl === video.url}
                      className={`btn-icon w-8 h-8 max-md:w-11 max-md:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 flex-shrink-0 hover:bg-red-500/20 transition-all disabled:opacity-50 ${HOVER_REVEAL}`}
                      title="Remove from history"
                      aria-label={`Remove ${title} from history`}
                    >
                      {deletingVideoUrl === video.url ? (
                        <Spinner className="w-4 h-4 border-sw-text-muted/30 border-t-sw-text-muted" />
                      ) : (
                        <Trash2 size={14} className="text-sw-text-muted hover:text-red-400" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Data */}
        <Section icon={<Database size={16} className="text-sw-text-muted" />} title="Data Management">
          <div className="space-y-3">
            {([
              {
                id: 'history' as const, icon: Clock, label: 'Clear Watch History', count: entries.length, countLabel: historyCountLabel,
                question: 'Delete your entire watch history? Progress for every video will be lost.',
              },
              {
                id: 'series' as const, icon: Layers, label: 'Clear All Series', count: allSeries.length, countLabel: String(allSeries.length),
                question: `Delete all ${allSeries.length} series? Your watch history is kept.`,
              },
            ]).map((row) =>
              confirmAction === row.id ? (
                <ConfirmRow
                  key={row.id}
                  question={row.question}
                  working={isWorking}
                  onCancel={() => setConfirmAction(null)}
                  onConfirm={handleConfirmedAction}
                />
              ) : (
                <button key={row.id} onClick={() => setConfirmAction(row.id)} disabled={!user || row.count === 0} className={dataRowClass}>
                  <row.icon size={16} className="text-sw-text-muted group-hover:text-sw-text-secondary transition-colors flex-shrink-0" />
                  <span className="flex-1 text-sw-text-secondary group-hover:text-sw-text transition-colors">
                    {row.label} {row.count > 0 && `(${row.countLabel})`}
                  </span>
                  <ChevronRight size={14} className={`text-sw-text-muted transition-opacity ${HOVER_REVEAL}`} />
                </button>
              )
            )}
            <button onClick={handleExport} disabled={!user} className={dataRowClass}>
              <Download size={16} className="text-sw-text-muted group-hover:text-sw-text-secondary transition-colors flex-shrink-0" />
              <span className="flex-1 text-sw-text-secondary group-hover:text-sw-text transition-colors">Export Data as JSON</span>
              <ChevronRight size={14} className={`text-sw-text-muted transition-opacity ${HOVER_REVEAL}`} />
            </button>
          </div>
        </Section>

        {/* Footer */}
        <div className="text-center py-6 border-t border-sw-border">
          <div className="flex items-center justify-center gap-2 text-sw-text-muted text-sm mb-2">
            <div className="bg-sw-accent rounded w-5 h-5 flex items-center justify-center">
              <Play size={10} fill="#f0ece8" stroke="none" />
            </div>
            <span className="font-heading font-semibold text-sw-text">StreamWatch</span>
          </div>
          <p className="font-body text-xs text-sw-text-muted">Version {version}</p>
        </div>
      </div>
    </div>
  );
}
