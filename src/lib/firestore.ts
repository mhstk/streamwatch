import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  deleteDoc as firestoreDeleteDoc,
  DocumentData,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { VideoHistory, Series, Episode } from '@/types';
import { extractHost, extractTitleFromUrl } from './utils';
import { mediaKeyFromUrl } from './titleParser';
import { logger } from './logger';

/**
 * Short, stable hash of a string for use as a Firestore document ID
 */
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Document ID for a video.
 *
 * Based on the media key (series+episode / movie+year / filename), NOT on the
 * raw URL: many hosts issue a new expiring link for the same file each time,
 * and progress has to survive that.
 */
function mediaDocId(videoUrl: string): string {
  return hashString(mediaKeyFromUrl(videoUrl));
}

/** Document ID used by older versions (hash of the full URL) */
function legacyDocId(videoUrl: string): string {
  return hashString(videoUrl);
}

/** How many recent entries to scan when looking for an older entry of the same video */
const LEGACY_SCAN_LIMIT = 300;

function docToHistory(id: string, data: DocumentData): VideoHistory {
  return {
    id,
    url: data.url,
    title: data.title,
    sourceHost: data.sourceHost || '',
    duration: data.duration || 0,
    progress: data.progress || 0,
    progressPercent: data.progressPercent || 0,
    completed: data.completed || false,
    lastWatched: data.lastWatched,
    createdAt: data.createdAt || data.lastWatched,
    sourcePage: data.sourcePage,
    // Poster info
    posterUrl: data.posterUrl,
    backdropUrl: data.backdropUrl,
    mediaTitle: data.mediaTitle,
    mediaYear: data.mediaYear,
    mediaType: data.mediaType,
    mediaRating: data.mediaRating,
    mediaOverview: data.mediaOverview,
  };
}

// Poster info to save with video history
export interface VideoPosterInfo {
  posterUrl?: string;
  backdropUrl?: string;
  mediaTitle?: string;
  mediaYear?: number;
  mediaType?: 'movie' | 'tv';
  mediaRating?: number;
  mediaOverview?: string;
}

/**
 * Save or update video progress
 */
export async function saveVideoProgress(
  userId: string,
  videoUrl: string,
  progress: number,
  duration: number,
  title: string,
  extra?: { sourcePage?: string }
): Promise<void> {
  const videoId = mediaDocId(videoUrl);
  const progressPercent = duration > 0 ? Math.round((progress / duration) * 100) : 0;
  const completed = progressPercent >= 90;

  logger.debug('firestore', 'SAVE_PROGRESS', {
    videoId,
    title,
    progress: Math.round(progress),
    progressPercent,
  });

  try {
    const db = getFirebaseDb();

    const videoData: Record<string, unknown> = {
      url: videoUrl, // always the most recent (and so most likely still valid) link
      mediaKey: mediaKeyFromUrl(videoUrl),
      title,
      sourceHost: extractHost(videoUrl),
      duration,
      progress,
      progressPercent,
      completed,
      lastWatched: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (extra?.sourcePage) videoData.sourcePage = extra.sourcePage;

    await setDoc(
      doc(db, 'users', userId, 'history', videoId),
      videoData,
      { merge: true }
    );
  } catch (err) {
    logger.error('firestore', 'SAVE_FAILED', { videoId, error: err });
    throw err;
  }
}

/**
 * Update poster info for a history entry (called after TMDB lookup).
 * Takes the history document ID, not the URL.
 */
export async function updateVideoPoster(
  userId: string,
  historyId: string,
  posterInfo: VideoPosterInfo
): Promise<void> {
  if (!historyId) return;

  try {
    const db = getFirebaseDb();
    const docRef = doc(db, 'users', userId, 'history', historyId);

    const updateData: Record<string, unknown> = {};
    if (posterInfo.posterUrl) updateData.posterUrl = posterInfo.posterUrl;
    if (posterInfo.backdropUrl) updateData.backdropUrl = posterInfo.backdropUrl;
    if (posterInfo.mediaTitle) updateData.mediaTitle = posterInfo.mediaTitle;
    if (posterInfo.mediaYear) updateData.mediaYear = posterInfo.mediaYear;
    if (posterInfo.mediaType) updateData.mediaType = posterInfo.mediaType;
    if (posterInfo.mediaRating !== undefined) updateData.mediaRating = posterInfo.mediaRating;
    if (posterInfo.mediaOverview) updateData.mediaOverview = posterInfo.mediaOverview;
    if (Object.keys(updateData).length === 0) return;

    // updateDoc fails if the entry was deleted in the meantime - which is what we want
    await updateDoc(docRef, updateData);
  } catch (err) {
    logger.error('firestore', 'UPDATE_POSTER_FAILED', { historyId, error: err });
    throw err;
  }
}

/**
 * Get saved progress for a video.
 *
 * Looks the video up by what it is, not by its exact URL, so a fresh link to
 * the same file resumes where the old one stopped.
 */
export async function getVideoProgress(
  userId: string,
  videoUrl: string
): Promise<VideoHistory | null> {
  try {
    const db = getFirebaseDb();
    const historyRef = collection(db, 'users', userId, 'history');

    // 1. Entry for this media
    const keySnap = await getDoc(doc(historyRef, mediaDocId(videoUrl)));
    if (keySnap.exists()) return docToHistory(keySnap.id, keySnap.data());

    // 2. Entry written by an older version for this exact URL
    const legacySnap = await getDoc(doc(historyRef, legacyDocId(videoUrl)));
    if (legacySnap.exists()) return docToHistory(legacySnap.id, legacySnap.data());

    // 3. Entry written by an older version for the same file behind another link
    const key = mediaKeyFromUrl(videoUrl);
    const recent = await getDocs(query(historyRef, orderBy('lastWatched', 'desc'), limit(LEGACY_SCAN_LIMIT)));
    for (const docSnap of recent.docs) {
      const data = docSnap.data();
      if (typeof data.url === 'string' && mediaKeyFromUrl(data.url) === key) {
        logger.info('firestore', 'GET_PROGRESS_FOUND_BY_KEY', { key });
        return docToHistory(docSnap.id, data);
      }
    }

    return null;
  } catch (err) {
    logger.error('firestore', 'GET_PROGRESS_FAILED', { error: err });
    throw err;
  }
}

/**
 * Get recent watch history (raw entries, newest first)
 */
export async function getRecentHistory(
  userId: string,
  maxResults: number = 10
): Promise<VideoHistory[]> {
  try {
    const db = getFirebaseDb();
    const historyRef = collection(db, 'users', userId, 'history');
    const q = query(historyRef, orderBy('lastWatched', 'desc'), limit(maxResults));
    const querySnapshot = await getDocs(q);

    const history: VideoHistory[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (typeof data.url !== 'string') return;
      history.push(docToHistory(docSnap.id, data));
    });

    logger.info('firestore', 'getRecentHistory complete', { count: history.length });
    return history;
  } catch (err) {
    logger.error('firestore', 'getRecentHistory failed', err);
    throw err;
  }
}

/**
 * Clear all watch history for a user
 */
export async function clearWatchHistory(userId: string): Promise<void> {
  logger.info('firestore', 'CLEAR_HISTORY_START', { userId });

  try {
    const db = getFirebaseDb();
    const historyRef = collection(db, 'users', userId, 'history');
    const querySnapshot = await getDocs(historyRef);

    await Promise.all(
      querySnapshot.docs.map((docSnapshot) =>
        firestoreDeleteDoc(doc(db, 'users', userId, 'history', docSnapshot.id))
      )
    );

    logger.info('firestore', 'CLEAR_HISTORY_SUCCESS', { deletedCount: querySnapshot.size });
  } catch (err) {
    logger.error('firestore', 'CLEAR_HISTORY_FAILED', { userId, error: err });
    throw err;
  }
}

/**
 * Delete history entries by document ID
 */
export async function deleteHistoryEntries(userId: string, historyIds: string[]): Promise<void> {
  const ids = Array.from(new Set(historyIds.filter(Boolean)));
  if (ids.length === 0) return;

  try {
    const db = getFirebaseDb();
    await Promise.all(
      ids.map((id) => firestoreDeleteDoc(doc(db, 'users', userId, 'history', id)))
    );
    logger.info('firestore', 'DELETE_HISTORY_SUCCESS', { count: ids.length });
  } catch (err) {
    logger.error('firestore', 'DELETE_HISTORY_FAILED', { error: err });
    throw err;
  }
}

// ==================== SERIES OPERATIONS ====================

/**
 * Generate a unique series ID
 */
function generateSeriesId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Create a new series
 */
export async function createSeries(
  userId: string,
  name: string,
  initialEpisode?: { url: string; title?: string; season?: number; episodeNumber?: number }
): Promise<Series> {
  const seriesId = generateSeriesId();

  logger.info('firestore', 'CREATE_SERIES', { userId, seriesId, name });

  try {
    const db = getFirebaseDb();

    const episodes: Episode[] = initialEpisode
      ? [{
          url: initialEpisode.url,
          title: initialEpisode.title || extractTitleFromUrl(initialEpisode.url),
          index: 0,
          season: initialEpisode.season ?? 1,
          episodeNumber: initialEpisode.episodeNumber,
          completed: false,
        }]
      : [];

    const seriesData = {
      name,
      episodes,
      currentEpisodeIndex: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'users', userId, 'series', seriesId), seriesData);

    logger.info('firestore', 'CREATE_SERIES_SUCCESS', { seriesId, name, episodeCount: episodes.length });

    return {
      id: seriesId,
      ...seriesData,
      createdAt: seriesData.createdAt as any,
      updatedAt: seriesData.updatedAt as any,
    };
  } catch (err) {
    logger.error('firestore', 'CREATE_SERIES_FAILED', { seriesId, error: err });
    throw err;
  }
}

/**
 * Migrate episode to ensure it has season field (defaults to 1)
 * and sort episodes by season then episodeNumber/index
 */
function migrateAndSortEpisodes(episodes: any[]): Episode[] {
  const seen = new Set<string>();
  return episodes
    .map((ep: any) => ({
      ...ep,
      season: ep.season ?? 1,
    }))
    .filter((ep) => {
      // Deduplicate by URL first
      if (seen.has(ep.url)) return false;
      // Then by season+episodeNumber (same episode from different CDN URLs)
      const key = `s${ep.season ?? 1}e${ep.episodeNumber ?? ep.index}`;
      if (seen.has(key)) return false;
      seen.add(ep.url);
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      // Sort by season first
      if (a.season !== b.season) {
        return a.season - b.season;
      }
      // Then by episodeNumber if available, otherwise by index
      const aNum = a.episodeNumber ?? a.index;
      const bNum = b.episodeNumber ?? b.index;
      return aNum - bNum;
    });
}

/**
 * Get a specific series by ID
 */
export async function getSeries(userId: string, seriesId: string): Promise<Series | null> {
  logger.info('firestore', 'GET_SERIES', { userId, seriesId });

  try {
    const db = getFirebaseDb();
    const docRef = doc(db, 'users', userId, 'series', seriesId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const series: Series = {
        id: docSnap.id,
        name: data.name,
        episodes: migrateAndSortEpisodes(data.episodes || []),
        currentEpisodeIndex: data.currentEpisodeIndex || 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        coverImage: data.coverImage,
      };

      logger.info('firestore', 'GET_SERIES_FOUND', { seriesId, name: series.name, episodeCount: series.episodes.length });
      return series;
    }

    logger.debug('firestore', 'GET_SERIES_NOT_FOUND', { seriesId });
    return null;
  } catch (err) {
    logger.error('firestore', 'GET_SERIES_FAILED', { seriesId, error: err });
    throw err;
  }
}

/**
 * Get all series for a user
 */
export async function getAllSeries(userId: string): Promise<Series[]> {
  logger.info('firestore', 'GET_ALL_SERIES', { userId });

  try {
    const db = getFirebaseDb();
    const seriesRef = collection(db, 'users', userId, 'series');
    const q = query(seriesRef, orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const seriesList: Series[] = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      seriesList.push({
        id: docSnap.id,
        name: data.name,
        episodes: migrateAndSortEpisodes(data.episodes || []),
        currentEpisodeIndex: data.currentEpisodeIndex || 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        coverImage: data.coverImage,
      });
    });

    logger.info('firestore', 'GET_ALL_SERIES_SUCCESS', { count: seriesList.length });
    return seriesList;
  } catch (err) {
    logger.error('firestore', 'GET_ALL_SERIES_FAILED', { error: err });
    throw err;
  }
}

/**
 * Add an episode to a series
 */
export async function addEpisodeToSeries(
  userId: string,
  seriesId: string,
  episodeUrl: string,
  episodeTitle?: string,
  season?: number,
  episodeNumber?: number
): Promise<void> {
  logger.info('firestore', 'ADD_EPISODE', { userId, seriesId, url: episodeUrl.substring(0, 50) + '...', season, episodeNumber });

  try {
    const db = getFirebaseDb();
    const seriesRef = doc(db, 'users', userId, 'series', seriesId);

    // Get current series to determine episode index
    const seriesSnap = await getDoc(seriesRef);
    if (!seriesSnap.exists()) {
      throw new Error('Series not found');
    }

    const currentEpisodes = seriesSnap.data().episodes || [];

    // If same season+episodeNumber exists, replace it (new URL from different CDN)
    const existingIdx = episodeNumber != null
      ? currentEpisodes.findIndex((ep: any) => ep.episodeNumber === episodeNumber && (ep.season ?? 1) === (season ?? 1))
      : currentEpisodes.findIndex((ep: any) => ep.url === episodeUrl || mediaKeyFromUrl(ep.url) === mediaKeyFromUrl(episodeUrl));

    const newEpisode: Episode = {
      url: episodeUrl,
      title: episodeTitle || extractTitleFromUrl(episodeUrl),
      index: existingIdx >= 0 ? currentEpisodes[existingIdx].index : currentEpisodes.length,
      season: season ?? 1,
      episodeNumber: episodeNumber,
      completed: existingIdx >= 0 ? currentEpisodes[existingIdx].completed : false,
      ...(existingIdx >= 0 && currentEpisodes[existingIdx].progress ? { progress: currentEpisodes[existingIdx].progress } : {}),
      ...(existingIdx >= 0 && currentEpisodes[existingIdx].duration ? { duration: currentEpisodes[existingIdx].duration } : {}),
      ...(existingIdx >= 0 && currentEpisodes[existingIdx].lastWatched ? { lastWatched: currentEpisodes[existingIdx].lastWatched } : {}),
    };

    if (existingIdx >= 0) {
      // Replace existing episode in-place
      const updatedEpisodes = [...currentEpisodes];
      updatedEpisodes[existingIdx] = newEpisode;
      await updateDoc(seriesRef, {
        episodes: updatedEpisodes,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(seriesRef, {
        episodes: arrayUnion(newEpisode),
        updatedAt: serverTimestamp(),
      });
    }

    logger.info('firestore', 'ADD_EPISODE_SUCCESS', { seriesId, episodeIndex: newEpisode.index, title: newEpisode.title });
  } catch (err) {
    logger.error('firestore', 'ADD_EPISODE_FAILED', { seriesId, error: err });
    throw err;
  }
}

/**
 * Update series (name, currentEpisodeIndex, etc.)
 */
export async function updateSeries(
  userId: string,
  seriesId: string,
  updates: Partial<Pick<Series, 'name' | 'currentEpisodeIndex' | 'episodes'>>
): Promise<void> {
  logger.info('firestore', 'UPDATE_SERIES', { userId, seriesId, updates: Object.keys(updates) });

  try {
    const db = getFirebaseDb();
    const seriesRef = doc(db, 'users', userId, 'series', seriesId);

    await updateDoc(seriesRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    logger.info('firestore', 'UPDATE_SERIES_SUCCESS', { seriesId });
  } catch (err) {
    logger.error('firestore', 'UPDATE_SERIES_FAILED', { seriesId, error: err });
    throw err;
  }
}

/**
 * Update episode progress within a series
 */
export async function updateEpisodeInSeries(
  userId: string,
  seriesId: string,
  episodeIndex: number,
  updates: Partial<Pick<Episode, 'duration' | 'progress' | 'completed' | 'lastWatched' | 'url'>>,
  episodeUrl?: string
): Promise<void> {
  logger.debug('firestore', 'UPDATE_EPISODE', { seriesId, episodeIndex, updates: Object.keys(updates) });

  try {
    const db = getFirebaseDb();
    const seriesRef = doc(db, 'users', userId, 'series', seriesId);

    const seriesSnap = await getDoc(seriesRef);
    if (!seriesSnap.exists()) {
      throw new Error('Series not found');
    }

    const episodes = [...(seriesSnap.data().episodes || [])];

    // Find by URL first (reliable after sorting), fall back to index
    let targetIndex = episodeUrl
      ? episodes.findIndex(ep => ep.url === episodeUrl)
      : episodeIndex;

    if (targetIndex < 0 || targetIndex >= episodes.length) {
      throw new Error(`Episode not found (url: ${episodeUrl}, index: ${episodeIndex})`);
    }

    episodes[targetIndex] = { ...episodes[targetIndex], ...updates };

    await updateDoc(seriesRef, {
      episodes,
      updatedAt: serverTimestamp(),
    });

  } catch (err) {
    logger.error('firestore', 'UPDATE_EPISODE_FAILED', { seriesId, episodeIndex, episodeUrl, error: err });
    throw err;
  }
}

/**
 * Remove an episode from a series
 */
export async function removeEpisodeFromSeries(
  userId: string,
  seriesId: string,
  episodeIndex: number
): Promise<void> {
  logger.info('firestore', 'REMOVE_EPISODE', { userId, seriesId, episodeIndex });

  try {
    const db = getFirebaseDb();
    const seriesRef = doc(db, 'users', userId, 'series', seriesId);

    const seriesSnap = await getDoc(seriesRef);
    if (!seriesSnap.exists()) {
      throw new Error('Series not found');
    }

    const episodes = [...(seriesSnap.data().episodes || [])];
    if (episodeIndex >= 0 && episodeIndex < episodes.length) {
      episodes.splice(episodeIndex, 1);
      // Re-index remaining episodes
      episodes.forEach((ep, idx) => {
        ep.index = idx;
      });

      await updateDoc(seriesRef, {
        episodes,
        updatedAt: serverTimestamp(),
      });

      logger.info('firestore', 'REMOVE_EPISODE_SUCCESS', { seriesId, remainingCount: episodes.length });
    } else {
      throw new Error('Episode index out of bounds');
    }
  } catch (err) {
    logger.error('firestore', 'REMOVE_EPISODE_FAILED', { seriesId, episodeIndex, error: err });
    throw err;
  }
}

/**
 * Delete a series
 */
export async function deleteSeries(userId: string, seriesId: string): Promise<void> {
  logger.info('firestore', 'DELETE_SERIES', { userId, seriesId });

  try {
    const db = getFirebaseDb();
    await firestoreDeleteDoc(doc(db, 'users', userId, 'series', seriesId));

    logger.info('firestore', 'DELETE_SERIES_SUCCESS', { seriesId });
  } catch (err) {
    logger.error('firestore', 'DELETE_SERIES_FAILED', { seriesId, error: err });
    throw err;
  }
}

/**
 * Delete every series of a user
 */
export async function deleteAllSeries(userId: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    const snapshot = await getDocs(collection(db, 'users', userId, 'series'));
    await Promise.all(
      snapshot.docs.map((d) => firestoreDeleteDoc(doc(db, 'users', userId, 'series', d.id)))
    );
    logger.info('firestore', 'DELETE_ALL_SERIES_SUCCESS', { count: snapshot.size });
  } catch (err) {
    logger.error('firestore', 'DELETE_ALL_SERIES_FAILED', { error: err });
    throw err;
  }
}

/**
 * Find the series containing a video.
 * Matches the exact URL first, then the same episode behind a different link.
 */
export async function findSeriesByVideoUrl(userId: string, videoUrl: string): Promise<{ series: Series; episodeIndex: number } | null> {
  logger.info('firestore', 'FIND_SERIES_BY_URL', { userId, url: videoUrl.substring(0, 50) + '...' });

  try {
    const allSeries = await getAllSeries(userId);

    for (const series of allSeries) {
      const episodeIndex = series.episodes.findIndex(ep => ep.url === videoUrl);
      if (episodeIndex !== -1) {
        return { series, episodeIndex };
      }
    }

    const key = mediaKeyFromUrl(videoUrl);
    for (const series of allSeries) {
      const episodeIndex = series.episodes.findIndex(ep => mediaKeyFromUrl(ep.url) === key);
      if (episodeIndex !== -1) {
        logger.info('firestore', 'FIND_SERIES_BY_KEY_FOUND', { seriesId: series.id, episodeIndex });
        return { series, episodeIndex };
      }
    }

    logger.debug('firestore', 'FIND_SERIES_BY_URL_NOT_FOUND');
    return null;
  } catch (err) {
    logger.error('firestore', 'FIND_SERIES_BY_URL_FAILED', { error: err });
    throw err;
  }
}

// ==================== SUBTITLE PREFERENCES ====================

export interface SubtitlePreference {
  subtitleId: number;
  language: string;
  languageName: string;
  release: string;
  savedAt: any;
}

/**
 * Save subtitle preference for a video
 */
export async function saveSubtitlePreference(
  userId: string,
  videoUrl: string,
  preference: Omit<SubtitlePreference, 'savedAt'>
): Promise<void> {
  const videoId = mediaDocId(videoUrl);

  logger.info('firestore', 'SAVE_SUBTITLE_PREF', {
    userId,
    videoId,
    subtitleId: preference.subtitleId,
    language: preference.language,
  });

  try {
    const db = getFirebaseDb();

    await setDoc(doc(db, 'users', userId, 'subtitlePrefs', videoId), {
      ...preference,
      videoUrl,
      savedAt: serverTimestamp(),
    });

    logger.info('firestore', 'SAVE_SUBTITLE_PREF_SUCCESS', { videoId, subtitleId: preference.subtitleId });
  } catch (err) {
    logger.error('firestore', 'SAVE_SUBTITLE_PREF_FAILED', { videoId, error: err });
    throw err;
  }
}

/**
 * Get subtitle preference for a video
 */
export async function getSubtitlePreference(
  userId: string,
  videoUrl: string
): Promise<SubtitlePreference | null> {
  const videoId = mediaDocId(videoUrl);

  try {
    const db = getFirebaseDb();
    let docSnap = await getDoc(doc(db, 'users', userId, 'subtitlePrefs', videoId));
    if (!docSnap.exists()) {
      // preference saved by an older version for this exact URL
      docSnap = await getDoc(doc(db, 'users', userId, 'subtitlePrefs', legacyDocId(videoUrl)));
    }

    if (docSnap.exists()) {
      const data = docSnap.data();
      const result: SubtitlePreference = {
        subtitleId: data.subtitleId,
        language: data.language,
        languageName: data.languageName,
        release: data.release,
        savedAt: data.savedAt,
      };

      logger.info('firestore', 'GET_SUBTITLE_PREF_FOUND', {
        videoId,
        subtitleId: result.subtitleId,
        language: result.language,
      });

      return result;
    }

    logger.debug('firestore', 'GET_SUBTITLE_PREF_NOT_FOUND', { videoId });
    return null;
  } catch (err) {
    logger.error('firestore', 'GET_SUBTITLE_PREF_FAILED', { videoId, error: err });
    throw err;
  }
}

/**
 * Delete subtitle preference for a video
 */
export async function deleteSubtitlePreference(
  userId: string,
  videoUrl: string
): Promise<void> {
  const videoId = mediaDocId(videoUrl);

  logger.info('firestore', 'DELETE_SUBTITLE_PREF', { userId, videoId });

  try {
    const db = getFirebaseDb();
    await firestoreDeleteDoc(doc(db, 'users', userId, 'subtitlePrefs', videoId));
    await firestoreDeleteDoc(doc(db, 'users', userId, 'subtitlePrefs', legacyDocId(videoUrl)));

    logger.info('firestore', 'DELETE_SUBTITLE_PREF_SUCCESS', { videoId });
  } catch (err) {
    logger.error('firestore', 'DELETE_SUBTITLE_PREF_FAILED', { videoId, error: err });
    throw err;
  }
}
