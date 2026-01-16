import { Timestamp } from 'firebase/firestore';

// Video history entry
export interface VideoHistory {
  id: string;                    // Hash of URL for consistent ID
  url: string;                   // Full video URL
  title: string;                 // Extracted from filename
  sourceHost: string;            // Domain where link was found
  duration: number;              // Total duration in seconds
  progress: number;              // Current position in seconds
  progressPercent: number;       // 0-100
  completed: boolean;            // true if watched > 90%
  lastWatched: Timestamp;        // Firebase timestamp
  createdAt: Timestamp;
  seriesId?: string;             // If part of a series
  episodeIndex?: number;         // Position in series
  // Poster info from TMDB (fetched once, stored)
  posterUrl?: string;            // Medium size poster URL
  backdropUrl?: string;          // Backdrop image URL
  mediaTitle?: string;           // Official title from TMDB
  mediaYear?: number;            // Release year
  mediaType?: 'movie' | 'tv';    // Media type
  mediaRating?: number;          // TMDB rating (0-10)
  mediaOverview?: string;        // Description/overview
}

// Episode within a series
export interface Episode {
  url: string;
  title: string;
  index: number;                 // 0-based position
  duration?: number;             // Populated after first play
  progress?: number;
  completed: boolean;
}

// Series/playlist of videos
export interface Series {
  id: string;
  name: string;
  episodes: Episode[];
  currentEpisodeIndex: number;   // Last watched
  createdAt: Timestamp;
  updatedAt: Timestamp;
  coverImage?: string;           // Auto-extracted thumbnail (future)
}

// Download settings
export interface DownloadSettings {
  enabled: boolean;              // Master toggle
  downloadWhileWatching: boolean;// Start download immediately when playing
  downloadLocation: 'downloads' | 'temp';
  tempCleanupDays: number;       // Delete temp files after X days (default: 5)
  maxConcurrentDownloads: number;// Default: 2
  pauseOnMetered: boolean;       // Pause on mobile data (future)
}

// Playback settings
export interface PlaybackSettings {
  autoResume: boolean;           // Resume from last position
  autoPlayNextEpisode: boolean;  // Auto-play next episode
  autoplayDelay: number;         // Seconds before auto-advance
  defaultPlaybackSpeed: number;  // Default: 1.0
  rememberSpeedPerVideo: boolean;// Remember speed per video
}

// Appearance settings
export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;           // Default: '#E50914' (Netflix red)
}

// User settings
export interface UserSettings {
  syncHistory: boolean;
  syncSeries: boolean;
  download: DownloadSettings;
  playback: PlaybackSettings;
  appearance: AppearanceSettings;
}

// User profile
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  settings: UserSettings;
  createdAt: Timestamp;
}

// Message types for extension communication
export type MessageType =
  | 'PLAY_VIDEO'
  | 'ADD_TO_SERIES'
  | 'CREATE_SERIES'
  | 'GET_HISTORY'
  | 'GET_SERIES'
  | 'SAVE_PROGRESS'
  | 'START_DOWNLOAD'
  | 'GET_DOWNLOAD_STATUS'
  | 'SCAN_SOURCE_PAGE'
  | 'REGISTER_VIDEO_SOURCE'
  | 'GET_VIDEO_SOURCE'
  | 'SCAN_FOR_EPISODES'
  | 'GET_VIDEO_LINKS'
  | 'GET_VIDEO_LINKS_WITH_INFO'
  | 'GET_PAGE_INFO'
  | 'GET_PAGE_INFO_DETAILED';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

// Download status
export interface DownloadStatus {
  id: number;
  url: string;
  filename: string;
  state: 'in_progress' | 'complete' | 'interrupted';
  bytesReceived: number;
  totalBytes: number;
  percentComplete: number;
}

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
  syncHistory: true,
  syncSeries: true,
  download: {
    enabled: true,
    downloadWhileWatching: true,
    downloadLocation: 'downloads',
    tempCleanupDays: 5,
    maxConcurrentDownloads: 2,
    pauseOnMetered: false,
  },
  playback: {
    autoResume: true,
    autoPlayNextEpisode: true,
    autoplayDelay: 5,
    defaultPlaybackSpeed: 1.0,
    rememberSpeedPerVideo: false,
  },
  appearance: {
    theme: 'dark',
    accentColor: '#E50914',
  },
};
