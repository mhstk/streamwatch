import { useState, useEffect, useCallback } from 'react';

export interface UserSettings {
  // Appearance
  theme: 'dark' | 'light' | 'system';
  accentColor: 'red' | 'blue' | 'green' | 'purple';

  // Playback
  autoResume: boolean;
  autoPlayNext: boolean;
  autoPlayDelay: number;
  defaultPlaybackSpeed: number;
  rememberPlaybackSpeed: boolean;

  // Sync
  syncHistory: boolean;
  syncSeries: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  accentColor: 'red',
  autoResume: true,
  autoPlayNext: true,
  autoPlayDelay: 5,
  defaultPlaybackSpeed: 1,
  rememberPlaybackSpeed: false,
  syncHistory: true,
  syncSeries: true,
};

const STORAGE_KEY = 'streamwatch_settings';

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from storage
  useEffect(() => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) {
        setSettings({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] });
      }
      setIsLoading(false);
    });
  }, []);

  // Save settings to storage
  const updateSettings = useCallback((updates: Partial<UserSettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };
      chrome.storage.sync.set({ [STORAGE_KEY]: newSettings });
      return newSettings;
    });
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (isLoading) return;

    const root = document.documentElement;

    // Handle theme
    if (settings.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
      root.classList.toggle('light', !prefersDark);
    } else {
      root.classList.toggle('dark', settings.theme === 'dark');
      root.classList.toggle('light', settings.theme === 'light');
    }

    // Handle accent color - set CSS variable
    const accentColors: Record<string, string> = {
      red: '#e50914',
      blue: '#3b82f6',
      green: '#22c55e',
      purple: '#a855f7',
    };
    root.style.setProperty('--sw-accent', accentColors[settings.accentColor] || accentColors.red);
  }, [settings.theme, settings.accentColor, isLoading]);

  return {
    settings,
    updateSettings,
    isLoading,
  };
}
