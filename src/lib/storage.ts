import { UserSettings, DEFAULT_SETTINGS, VideoHistory, Series } from '@/types';
import { STORAGE_KEYS } from './constants';

/**
 * Chrome storage wrapper for type-safe access
 */

// Get user settings from local storage
export async function getSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
      resolve(result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS);
    });
  });
}

// Save user settings to local storage
export async function saveSettings(settings: UserSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, resolve);
  });
}

// Update partial settings
export async function updateSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await saveSettings(updated);
  return updated;
}

// Get local video history (for offline/non-synced use)
export async function getLocalHistory(): Promise<VideoHistory[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.LOCAL_HISTORY], (result) => {
      resolve(result[STORAGE_KEYS.LOCAL_HISTORY] || []);
    });
  });
}

// Save video to local history
export async function saveToLocalHistory(video: VideoHistory): Promise<void> {
  const history = await getLocalHistory();
  const existingIndex = history.findIndex((v) => v.id === video.id);

  if (existingIndex >= 0) {
    history[existingIndex] = video;
  } else {
    history.unshift(video);
  }

  // Keep only last 100 items
  const trimmed = history.slice(0, 100);

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.LOCAL_HISTORY]: trimmed }, resolve);
  });
}

// Get local series (for offline/non-synced use)
export async function getLocalSeries(): Promise<Series[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.LOCAL_SERIES], (result) => {
      resolve(result[STORAGE_KEYS.LOCAL_SERIES] || []);
    });
  });
}

// Save series to local storage
export async function saveLocalSeries(series: Series[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.LOCAL_SERIES]: series }, resolve);
  });
}

// Get single series by ID
export async function getSeriesById(seriesId: string): Promise<Series | null> {
  const allSeries = await getLocalSeries();
  return allSeries.find((s) => s.id === seriesId) || null;
}

// Clear all local data
export async function clearAllLocalData(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

// Listen for storage changes
export function onStorageChange(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === 'local') {
      callback(changes);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  // Return cleanup function
  return () => chrome.storage.onChanged.removeListener(listener);
}
