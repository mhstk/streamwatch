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
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { VideoHistory, Series, Episode } from '@/types';
import { extractHost, extractTitleFromUrl } from './utils';
import { logger } from './logger';

/**
 * Generate a consistent ID from URL for Firestore document
 */
function generateVideoId(url: string): string {
  // Simple hash for sync operation - base64 encode and clean
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Save or update video progress
 */
export async function saveVideoProgress(
  userId: string,
  videoUrl: string,
  progress: number,
  duration: number,
  title: string
): Promise<void> {
  const videoId = generateVideoId(videoUrl);
  const progressPercent = duration > 0 ? Math.round((progress / duration) * 100) : 0;
  const completed = progressPercent >= 90;

  logger.info('firestore', 'SAVE_PROGRESS', {
    userId,
    videoId,
    title,
    progress: Math.round(progress),
    duration: Math.round(duration),
    progressPercent,
    completed,
    url: videoUrl.substring(0, 50) + '...'
  });

  try {
    const db = getFirebaseDb();

    const videoData = {
      url: videoUrl,
      title,
      sourceHost: extractHost(videoUrl),
      duration,
      progress,
      progressPercent,
      completed,
      lastWatched: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(
      doc(db, 'users', userId, 'history', videoId),
      videoData,
      { merge: true }
    );

    logger.info('firestore', 'SAVE_SUCCESS', { videoId, progressPercent });
  } catch (err) {
    logger.error('firestore', 'SAVE_FAILED', { videoId, error: err });
    throw err;
  }
}

/**
 * Get video progress for a specific video
 */
export async function getVideoProgress(
  userId: string,
  videoUrl: string
): Promise<VideoHistory | null> {
  const videoId = generateVideoId(videoUrl);

  logger.info('firestore', 'GET_PROGRESS', {
    userId,
    videoId,
    url: videoUrl.substring(0, 50) + '...'
  });

  try {
    const db = getFirebaseDb();
    const docRef = doc(db, 'users', userId, 'history', videoId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const result = {
        id: docSnap.id,
        url: data.url,
        title: data.title,
        sourceHost: data.sourceHost || '',
        duration: data.duration,
        progress: data.progress,
        progressPercent: data.progressPercent,
        completed: data.completed || false,
        lastWatched: data.lastWatched,
        createdAt: data.createdAt || data.lastWatched,
      };

      logger.info('firestore', 'GET_PROGRESS_FOUND', {
        videoId,
        title: result.title,
        progress: Math.round(result.progress),
        progressPercent: result.progressPercent
      });

      return result;
    }

    logger.debug('firestore', 'GET_PROGRESS_NOT_FOUND', { videoId });
    return null;
  } catch (err) {
    logger.error('firestore', 'GET_PROGRESS_FAILED', { videoId, error: err });
    throw err;
  }
}

/**
 * Get recent watch history
 */
export async function getRecentHistory(
  userId: string,
  maxResults: number = 10
): Promise<VideoHistory[]> {
  logger.info('firestore', 'getRecentHistory', { userId, maxResults });

  try {
    const db = getFirebaseDb();
    logger.debug('firestore', 'Got db instance');

    const historyRef = collection(db, 'users', userId, 'history');
    const q = query(historyRef, orderBy('lastWatched', 'desc'), limit(maxResults));

    logger.debug('firestore', 'Executing query...');
    const querySnapshot = await getDocs(q);
    logger.debug('firestore', 'Query complete', { docCount: querySnapshot.size });

    const history: VideoHistory[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      history.push({
        id: doc.id,
        url: data.url,
        title: data.title,
        sourceHost: data.sourceHost || '',
        duration: data.duration,
        progress: data.progress,
        progressPercent: data.progressPercent,
        completed: data.completed || false,
        lastWatched: data.lastWatched,
        createdAt: data.createdAt || data.lastWatched,
      });
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

    logger.debug('firestore', 'CLEAR_HISTORY_DOCS_FOUND', { count: querySnapshot.size });

    const { deleteDoc } = await import('firebase/firestore');

    const deletePromises = querySnapshot.docs.map((docSnapshot) => {
      logger.debug('firestore', 'DELETING_DOC', { docId: docSnapshot.id });
      return deleteDoc(doc(db, 'users', userId, 'history', docSnapshot.id));
    });

    await Promise.all(deletePromises);

    logger.info('firestore', 'CLEAR_HISTORY_SUCCESS', { deletedCount: querySnapshot.size });
  } catch (err) {
    logger.error('firestore', 'CLEAR_HISTORY_FAILED', { userId, error: err });
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
  initialEpisode?: { url: string; title?: string }
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
        episodes: data.episodes || [],
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
        episodes: data.episodes || [],
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
  episodeTitle?: string
): Promise<void> {
  logger.info('firestore', 'ADD_EPISODE', { userId, seriesId, url: episodeUrl.substring(0, 50) + '...' });

  try {
    const db = getFirebaseDb();
    const seriesRef = doc(db, 'users', userId, 'series', seriesId);

    // Get current series to determine episode index
    const seriesSnap = await getDoc(seriesRef);
    if (!seriesSnap.exists()) {
      throw new Error('Series not found');
    }

    const currentEpisodes = seriesSnap.data().episodes || [];
    const newEpisode: Episode = {
      url: episodeUrl,
      title: episodeTitle || extractTitleFromUrl(episodeUrl),
      index: currentEpisodes.length,
      completed: false,
    };

    await updateDoc(seriesRef, {
      episodes: arrayUnion(newEpisode),
      updatedAt: serverTimestamp(),
    });

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
  updates: Partial<Pick<Episode, 'duration' | 'progress' | 'completed'>>
): Promise<void> {
  logger.info('firestore', 'UPDATE_EPISODE', { userId, seriesId, episodeIndex, updates });

  try {
    const db = getFirebaseDb();
    const seriesRef = doc(db, 'users', userId, 'series', seriesId);

    const seriesSnap = await getDoc(seriesRef);
    if (!seriesSnap.exists()) {
      throw new Error('Series not found');
    }

    const episodes = [...(seriesSnap.data().episodes || [])];
    if (episodeIndex >= 0 && episodeIndex < episodes.length) {
      episodes[episodeIndex] = { ...episodes[episodeIndex], ...updates };

      await updateDoc(seriesRef, {
        episodes,
        updatedAt: serverTimestamp(),
      });

      logger.info('firestore', 'UPDATE_EPISODE_SUCCESS', { seriesId, episodeIndex });
    } else {
      throw new Error('Episode index out of bounds');
    }
  } catch (err) {
    logger.error('firestore', 'UPDATE_EPISODE_FAILED', { seriesId, episodeIndex, error: err });
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
 * Find series containing a specific video URL
 */
export async function findSeriesByVideoUrl(userId: string, videoUrl: string): Promise<{ series: Series; episodeIndex: number } | null> {
  logger.info('firestore', 'FIND_SERIES_BY_URL', { userId, url: videoUrl.substring(0, 50) + '...' });

  try {
    const allSeries = await getAllSeries(userId);

    for (const series of allSeries) {
      const episodeIndex = series.episodes.findIndex(ep => ep.url === videoUrl);
      if (episodeIndex !== -1) {
        logger.info('firestore', 'FIND_SERIES_BY_URL_FOUND', { seriesId: series.id, episodeIndex });
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
