/**
 * Turns raw watch history + saved series into what the UI shows:
 * one card per series, one card per movie, a "continue watching" list and a
 * flat, de-duplicated history.
 *
 * Pure functions only (no Firebase / chrome APIs) so this can be unit tested.
 */
import type { VideoHistory, Series, Episode } from '@/types';
import { ParsedMedia, formatEpisodeCode, mediaKeyFromUrl, normalizeName, parseMediaUrl } from './titleParser';

/** A video counts as finished from this percentage on (credits) */
export const FINISHED_PERCENT = 90;

/** Below this, a play is treated as "just opened it", not as real progress */
const PEEK_PERCENT = 3;

export interface HistoryEntry {
  /** Media key - identical for the same video behind different links */
  key: string;
  parsed: ParsedMedia;
  /** Most recently watched record of this video */
  video: VideoHistory;
  /** Every history document that belongs to this video (old duplicates included) */
  historyIds: string[];
  /** "Friends" / "Saltburn" */
  title: string;
  /** "S05E16" / "2023" */
  subtitle: string;
  lastWatched: number;
  finished: boolean;
}

export interface LibraryEpisode {
  season: number;
  episode: number;
  url: string;
  duration: number;
  progress: number;
  progressPercent: number;
  finished: boolean;
  /** ms since epoch, 0 = never played */
  lastWatched: number;
  historyIds: string[];
}

export interface LibrarySeries {
  type: 'series';
  key: string;
  name: string;
  /** Saved series documents merged into this card (empty = detected from history only) */
  seriesIds: string[];
  episodes: LibraryEpisode[];
  lastWatched: number;
  /** Episode to resume / play next, if any */
  next?: LibraryEpisode;
  posterUrl?: string;
  backdropUrl?: string;
  historyIds: string[];
}

export interface LibraryMovie {
  type: 'movie';
  key: string;
  title: string;
  year?: number;
  entry: HistoryEntry;
  lastWatched: number;
  finished: boolean;
}

export type LibraryItem = LibrarySeries | LibraryMovie;

export interface Library {
  continueWatching: LibraryItem[];
  series: LibrarySeries[];
  movies: LibraryMovie[];
  /** Everything played, newest first, one row per video */
  entries: HistoryEntry[];
}

/** Firestore Timestamp | {seconds} | Date | number -> ms (0 when unknown) */
export function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

function percent(progress: number | undefined, duration: number | undefined): number {
  if (!progress || !duration || duration <= 0) return 0;
  return Math.min(100, Math.round((progress / duration) * 100));
}

/** Collapse raw history documents into one entry per video */
export function dedupeHistory(history: VideoHistory[]): HistoryEntry[] {
  const byKey = new Map<string, HistoryEntry>();

  for (const video of history) {
    if (!video?.url) continue;
    const parsed = parseMediaUrl(video.url);
    const lastWatched = toMillis(video.lastWatched);
    const existing = byKey.get(parsed.key);

    if (!existing) {
      const isEpisode = parsed.kind === 'episode';
      const tmdbTitle = video.mediaTitle && (isEpisode ? video.mediaType === 'tv' : video.mediaType !== 'tv')
        ? video.mediaTitle
        : undefined;
      byKey.set(parsed.key, {
        key: parsed.key,
        parsed,
        video,
        historyIds: [video.id],
        title: tmdbTitle || parsed.title,
        subtitle: isEpisode
          ? formatEpisodeCode(parsed.season, parsed.episode!)
          : String(video.mediaYear || parsed.year || ''),
        lastWatched,
        finished: video.completed || video.progressPercent >= FINISHED_PERCENT,
      });
      continue;
    }

    existing.historyIds.push(video.id);

    // A few seconds of playback through a new link must not hide real
    // progress made through an older one (older versions always started a
    // new link from zero): keep the meaningful record, just bump its date.
    const isPeek = (v: VideoHistory) => v.progressPercent < PEEK_PERCENT && !v.completed;
    if (isPeek(video) !== isPeek(existing.video)) {
      if (isPeek(existing.video)) {
        existing.video = {
          ...video,
          lastWatched: lastWatched > existing.lastWatched ? video.lastWatched : existing.video.lastWatched,
          posterUrl: video.posterUrl || existing.video.posterUrl,
          backdropUrl: video.backdropUrl || existing.video.backdropUrl,
          mediaTitle: video.mediaTitle || existing.video.mediaTitle,
          mediaYear: video.mediaYear || existing.video.mediaYear,
          mediaType: video.mediaType || existing.video.mediaType,
          // the link that was used last is the one most likely to still work
          url: lastWatched > existing.lastWatched ? video.url : existing.video.url,
        };
        existing.finished = video.completed || video.progressPercent >= FINISHED_PERCENT;
      } else if (lastWatched > existing.lastWatched) {
        existing.video = { ...existing.video, lastWatched: video.lastWatched, url: video.url };
      }
      existing.lastWatched = Math.max(existing.lastWatched, lastWatched);
      continue;
    }

    // keep the most recently watched record, but never lose poster info
    if (lastWatched > existing.lastWatched) {
      const merged: VideoHistory = {
        ...video,
        posterUrl: video.posterUrl || existing.video.posterUrl,
        backdropUrl: video.backdropUrl || existing.video.backdropUrl,
        mediaTitle: video.mediaTitle || existing.video.mediaTitle,
        mediaYear: video.mediaYear || existing.video.mediaYear,
        mediaType: video.mediaType || existing.video.mediaType,
        sourcePage: video.sourcePage || existing.video.sourcePage,
      };
      existing.video = merged;
      existing.lastWatched = lastWatched;
      existing.finished = video.completed || video.progressPercent >= FINISHED_PERCENT;
    } else if (!existing.video.posterUrl && video.posterUrl) {
      existing.video = {
        ...existing.video,
        posterUrl: video.posterUrl,
        backdropUrl: existing.video.backdropUrl || video.backdropUrl,
        mediaTitle: existing.video.mediaTitle || video.mediaTitle,
        mediaYear: existing.video.mediaYear || video.mediaYear,
        mediaType: existing.video.mediaType || video.mediaType,
      };
    }
  }

  const entries = Array.from(byKey.values()).sort((a, b) => b.lastWatched - a.lastWatched);

  // Every episode of a series shows the same series name: the official
  // (TMDB) one if any of its episodes has it stored.
  const officialName = new Map<string, string>();
  for (const entry of entries) {
    const seriesKey = entry.parsed.seriesKey;
    if (seriesKey && entry.title !== entry.parsed.title && !officialName.has(seriesKey)) {
      officialName.set(seriesKey, entry.title);
    }
  }
  for (const entry of entries) {
    const name = entry.parsed.seriesKey && officialName.get(entry.parsed.seriesKey);
    if (name) entry.title = name;
  }

  return entries;
}

interface SeriesDraft {
  key: string;
  name: string;
  nameFromSeries: boolean;
  seriesIds: string[];
  episodes: Map<string, LibraryEpisode>;
  posterUrl?: string;
  backdropUrl?: string;
  historyIds: string[];
}

function upsertEpisode(draft: SeriesDraft, incoming: LibraryEpisode): void {
  const slot = `${incoming.season}:${incoming.episode}`;
  const existing = draft.episodes.get(slot);
  if (!existing) {
    draft.episodes.set(slot, incoming);
    return;
  }
  const newer = incoming.lastWatched >= existing.lastWatched ? incoming : existing;
  const older = newer === incoming ? existing : incoming;
  draft.episodes.set(slot, {
    ...newer,
    // the most recently used link is the one most likely to still work
    url: newer.url || older.url,
    duration: newer.duration || older.duration,
    finished: newer.finished || (older.finished && newer.lastWatched === 0),
    historyIds: [...new Set([...existing.historyIds, ...incoming.historyIds])],
  });
}

function pickNext(episodes: LibraryEpisode[]): LibraryEpisode | undefined {
  let latestIdx = -1;
  for (let i = 0; i < episodes.length; i++) {
    if (episodes[i].lastWatched > 0 &&
        (latestIdx === -1 || episodes[i].lastWatched >= episodes[latestIdx].lastWatched)) {
      latestIdx = i;
    }
  }
  if (latestIdx === -1) return undefined;
  if (!episodes[latestIdx].finished) return episodes[latestIdx];
  // finished the last one played -> the following episode, if we know it
  for (let i = latestIdx + 1; i < episodes.length; i++) {
    if (!episodes[i].finished) return episodes[i];
  }
  return undefined;
}

/**
 * Build the library shown on the home page.
 */
export function buildLibrary(history: VideoHistory[], allSeries: Series[]): Library {
  const entries = dedupeHistory(history);
  const drafts = new Map<string, SeriesDraft>();
  /** media key of an episode -> group it was filed under by a saved series */
  const keyToGroup = new Map<string, string>();

  const getDraft = (key: string, name: string, fromSeries: boolean): SeriesDraft => {
    let draft = drafts.get(key);
    if (!draft) {
      draft = { key, name, nameFromSeries: fromSeries, seriesIds: [], episodes: new Map(), historyIds: [] };
      drafts.set(key, draft);
    } else if (fromSeries && !draft.nameFromSeries) {
      draft.name = name;
      draft.nameFromSeries = true;
    }
    return draft;
  };

  // 1. saved series (two saved series with the same name become one card)
  for (const series of allSeries) {
    const norm = normalizeName(series.name);
    const groupKey = norm ? `tv:${norm}` : `series:${series.id}`;
    const draft = getDraft(groupKey, series.name, true);
    draft.seriesIds.push(series.id);

    for (const ep of series.episodes) {
      if (!ep?.url) continue;
      const parsed = parseMediaUrl(ep.url);
      keyToGroup.set(parsed.key, groupKey);
      const duration = ep.duration || 0;
      const progress = ep.progress || 0;
      const pct = percent(progress, duration);
      upsertEpisode(draft, {
        season: ep.season ?? parsed.season ?? 1,
        episode: ep.episodeNumber ?? parsed.episode ?? ep.index + 1,
        url: ep.url,
        duration,
        progress,
        progressPercent: pct,
        finished: !!ep.completed || pct >= FINISHED_PERCENT,
        lastWatched: toMillis(ep.lastWatched),
        historyIds: [],
      });
    }
  }

  // 2. history: episodes join their series card, everything else is a movie
  const movies: LibraryMovie[] = [];
  for (const entry of entries) {
    const { parsed, video } = entry;
    const savedGroup = keyToGroup.get(entry.key);
    const groupKey = savedGroup || (parsed.kind === 'episode' ? parsed.seriesKey : undefined);

    if (!groupKey) {
      movies.push({
        type: 'movie',
        key: entry.key,
        title: entry.title,
        year: video.mediaYear || parsed.year,
        entry,
        lastWatched: entry.lastWatched,
        finished: entry.finished,
      });
      continue;
    }

    const draft = getDraft(groupKey, entry.title, false);
    draft.historyIds.push(...entry.historyIds);
    if (!draft.posterUrl && video.posterUrl && video.mediaType !== 'movie') draft.posterUrl = video.posterUrl;
    if (!draft.backdropUrl && video.backdropUrl && video.mediaType !== 'movie') draft.backdropUrl = video.backdropUrl;

    // slot inside the series: prefer what the saved series says, else the filename
    let season = parsed.season ?? 1;
    let episode = parsed.episode;
    if (episode === undefined) {
      const slot = Array.from(draft.episodes.values()).find(e => mediaKeyFromUrl(e.url) === entry.key);
      if (!slot) continue;
      season = slot.season;
      episode = slot.episode;
    }

    upsertEpisode(draft, {
      season,
      episode,
      url: video.url,
      duration: video.duration || 0,
      progress: video.progress || 0,
      progressPercent: video.progressPercent || 0,
      finished: entry.finished,
      lastWatched: entry.lastWatched,
      historyIds: entry.historyIds,
    });
  }

  const series: LibrarySeries[] = Array.from(drafts.values())
    .map((draft): LibrarySeries => {
      const episodes = Array.from(draft.episodes.values()).sort(
        (a, b) => a.season - b.season || a.episode - b.episode
      );
      return {
        type: 'series',
        key: draft.key,
        name: draft.name,
        seriesIds: draft.seriesIds,
        episodes,
        lastWatched: episodes.reduce((max, e) => Math.max(max, e.lastWatched), 0),
        next: pickNext(episodes),
        posterUrl: draft.posterUrl,
        backdropUrl: draft.backdropUrl,
        historyIds: draft.historyIds,
      };
    })
    .filter(s => s.episodes.length > 0 || s.seriesIds.length > 0)
    .sort((a, b) => b.lastWatched - a.lastWatched || a.name.localeCompare(b.name));

  const continueWatching: LibraryItem[] = [
    ...series.filter(s => s.next),
    // a movie that was only opened (0%) is in the library, but isn't "in progress"
    ...movies.filter(m => !m.finished && m.entry.video.progressPercent >= 1),
  ].sort((a, b) => b.lastWatched - a.lastWatched);

  return { continueWatching, series, movies, entries };
}

/** Label for an episode inside its series: "Episode 4" */
export function episodeLabel(ep: Pick<Episode, 'title' | 'episodeNumber' | 'index' | 'url'>): string {
  if (ep.episodeNumber !== undefined && ep.episodeNumber !== null) return `Episode ${ep.episodeNumber}`;
  const parsed = parseMediaUrl(ep.url);
  if (parsed.kind === 'episode' && parsed.episode !== undefined) return `Episode ${parsed.episode}`;
  return parsed.displayTitle || ep.title;
}

/** Shape a library series like a saved Series, for components that render one */
export function toSeries(item: LibrarySeries): Series {
  const episodes: Episode[] = item.episodes.map((ep, index) => ({
    url: ep.url,
    title: `Episode ${ep.episode}`,
    index,
    season: ep.season,
    episodeNumber: ep.episode,
    duration: ep.duration || undefined,
    progress: ep.progress || undefined,
    completed: ep.finished,
    lastWatched: ep.lastWatched || undefined,
  }));
  return {
    id: item.seriesIds[0] || item.key,
    name: item.name,
    episodes,
    currentEpisodeIndex: 0,
    createdAt: null as unknown as Series['createdAt'],
    updatedAt: null as unknown as Series['updatedAt'],
  };
}
