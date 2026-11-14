import { useState, useEffect, useCallback } from 'react';

export type AccentColor = 'red' | 'blue' | 'green' | 'purple';

export interface UserSettings {
  // Appearance
  accentColor: AccentColor;

  // Playback
  autoResume: boolean;
  autoPlayNext: boolean;
  autoPlayDelay: number;
  defaultPlaybackSpeed: number;
  rememberPlaybackSpeed: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  accentColor: 'red',
  autoResume: true,
  autoPlayNext: true,
  autoPlayDelay: 5,
  defaultPlaybackSpeed: 1,
  rememberPlaybackSpeed: false,
};

export const SETTINGS_STORAGE_KEY = 'streamwatch_settings';

/** Accent palettes as "r g b" triplets: [base, hover, pressed] */
export const ACCENT_PALETTES: Record<AccentColor, [string, string, string]> = {
  red: ['185 28 28', '220 38 38', '153 27 27'],
  blue: ['37 99 235', '59 130 246', '29 78 216'],
  green: ['22 163 74', '34 197 94', '21 128 61'],
  purple: ['147 51 234', '168 85 247', '126 34 206'],
};

function normalize(stored: unknown): UserSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) } as UserSettings;
  if (!(merged.accentColor in ACCENT_PALETTES)) merged.accentColor = DEFAULT_SETTINGS.accentColor;
  merged.autoPlayDelay = Math.max(1, Math.min(30, Number(merged.autoPlayDelay) || DEFAULT_SETTINGS.autoPlayDelay));
  merged.defaultPlaybackSpeed = Number(merged.defaultPlaybackSpeed) || 1;
  return merged;
}

/** Push the accent colour into the CSS variables every page styles itself with */
export function applyAccent(accent: AccentColor): void {
  const [base, hover, dark] = ACCENT_PALETTES[accent] || ACCENT_PALETTES.red;
  const root = document.documentElement;
  root.style.setProperty('--sw-accent-rgb', base);
  root.style.setProperty('--sw-accent-hover-rgb', hover);
  root.style.setProperty('--sw-accent-dark-rgb', dark);
}

export function loadSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(SETTINGS_STORAGE_KEY, (result) => {
        resolve(normalize(result?.[SETTINGS_STORAGE_KEY]));
      });
    } catch {
      resolve(DEFAULT_SETTINGS);
    }
  });
}

/**
 * Apply stored appearance settings to the current page and keep them in sync.
 * Called once from every page's entry point (player, home, popup, settings).
 */
export function initAppearance(): void {
  loadSettings().then((settings) => applyAccent(settings.accentColor));
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[SETTINGS_STORAGE_KEY]) {
        applyAccent(normalize(changes[SETTINGS_STORAGE_KEY].newValue).accentColor);
      }
    });
  } catch {
    // not running inside the extension
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings, and follow changes made on other pages (e.g. the options page)
  useEffect(() => {
    let cancelled = false;
    loadSettings().then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      setIsLoading(false);
    });

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'sync' && changes[SETTINGS_STORAGE_KEY]) {
        setSettings(normalize(changes[SETTINGS_STORAGE_KEY].newValue));
      }
    };
    try {
      chrome.storage.onChanged.addListener(onChanged);
    } catch {
      // not running inside the extension
    }

    return () => {
      cancelled = true;
      try {
        chrome.storage.onChanged.removeListener(onChanged);
      } catch {
        // ignore
      }
    };
  }, []);

  const updateSettings = useCallback((updates: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = normalize({ ...prev, ...updates });
      chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: next });
      return next;
    });
  }, []);

  return {
    settings,
    updateSettings,
    isLoading,
  };
}
