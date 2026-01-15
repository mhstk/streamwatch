import { VIDEO_EXTENSIONS, CONTEXT_MENU_IDS } from '@/lib/constants';
import { registerVideoSource } from './messageHandler';

/**
 * Check if URL is a video link based on extension
 */
function isVideoUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Set up context menu items
 */
export function setupContextMenu(): void {
  // Remove existing menus first
  chrome.contextMenus.removeAll(() => {
    // Main "Play in StreamWatch" option for links
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.PLAY,
      title: 'Play in StreamWatch',
      contexts: ['link'],
    });

    // Download only option
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.DOWNLOAD,
      title: 'Download Only',
      contexts: ['link'],
    });

    console.log('Context menus created');
  });
}

/**
 * Handle context menu clicks
 */
export function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): void {
  const linkUrl = info.linkUrl;

  if (!linkUrl) {
    console.log('No link URL found');
    return;
  }

  // Check if it's a video URL
  if (!isVideoUrl(linkUrl)) {
    console.log('Not a video URL:', linkUrl);
    // Still allow playing - let the player handle it
  }

  switch (info.menuItemId) {
    case CONTEXT_MENU_IDS.PLAY:
      openInPlayer(linkUrl, tab);
      break;

    case CONTEXT_MENU_IDS.DOWNLOAD:
      downloadVideo(linkUrl);
      break;

    default:
      console.log('Unknown menu item:', info.menuItemId);
  }
}

/**
 * Open video in StreamWatch player
 */
function openInPlayer(videoUrl: string, sourceTab?: chrome.tabs.Tab): void {
  const playerPage = chrome.runtime.getURL('index.html');
  const params = new URLSearchParams({ url: videoUrl });
  const playerUrl = `${playerPage}?${params.toString()}`;

  // Register the source page so we can scan it later for episodes
  if (sourceTab?.url) {
    registerVideoSource(videoUrl, sourceTab.url, sourceTab.id);
  }

  chrome.tabs.create({
    url: playerUrl,
    active: true,
  }, (tab) => {
    console.log('Opened player tab:', tab?.id, 'for video:', videoUrl);
  });
}

/**
 * Download video file
 */
function downloadVideo(videoUrl: string): void {
  chrome.downloads.download({
    url: videoUrl,
    saveAs: true,
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('Download failed:', chrome.runtime.lastError.message);
    } else {
      console.log('Started download:', downloadId);
    }
  });
}
