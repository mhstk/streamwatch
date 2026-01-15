// Supported video file extensions
export const VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.webm',
  '.avi',
  '.mov',
  '.m4v',
  '.flv',
  '.wmv',
  '.mpg',
  '.mpeg',
  '.3gp',
  '.ogv',
] as const;

// Video MIME types
export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/x-matroska',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-flv',
  'video/x-ms-wmv',
] as const;

// Progress save interval in milliseconds
export const PROGRESS_SAVE_INTERVAL = 5000;

// Consider video completed if watched >= this percentage
export const COMPLETION_THRESHOLD = 90;

// Auto-resume prompt timeout in seconds
export const RESUME_PROMPT_TIMEOUT = 3;

// Next episode auto-advance delay in seconds
export const NEXT_EPISODE_DELAY = 5;

// Default keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  PLAY_PAUSE: ['Space', 'k'],
  SEEK_BACK: ['ArrowLeft', 'j'],
  SEEK_FORWARD: ['ArrowRight', 'l'],
  VOLUME_UP: ['ArrowUp'],
  VOLUME_DOWN: ['ArrowDown'],
  MUTE: ['m'],
  FULLSCREEN: ['f'],
  NEXT_EPISODE: ['n'],
  PREV_EPISODE: ['p'],
} as const;

// Seek amount in seconds
export const SEEK_AMOUNT = 10;

// Volume change amount (0-1)
export const VOLUME_STEP = 0.1;

// Extension storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'streamwatch_settings',
  AUTH_TOKEN: 'streamwatch_auth_token',
  USER_PROFILE: 'streamwatch_user_profile',
  LOCAL_HISTORY: 'streamwatch_local_history',
  LOCAL_SERIES: 'streamwatch_local_series',
} as const;

// Context menu IDs
export const CONTEXT_MENU_IDS = {
  PLAY: 'streamwatch_play',
  ADD_TO_SERIES: 'streamwatch_add_to_series',
  CREATE_SERIES: 'streamwatch_create_series',
  DOWNLOAD: 'streamwatch_download',
} as const;
