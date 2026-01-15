import { ExtensionMessage } from '@/types';

// Store source page info when videos are opened
const videoSourceMap = new Map<string, { sourceUrl: string; sourceTabId?: number; timestamp: number }>();

/**
 * Register a video source (exported for use by other background modules)
 */
export function registerVideoSource(videoUrl: string, sourceUrl: string, sourceTabId?: number): void {
  videoSourceMap.set(videoUrl, {
    sourceUrl,
    sourceTabId,
    timestamp: Date.now(),
  });
  console.log('Registered video source:', videoUrl, '->', sourceUrl);
}

/**
 * Handle messages from content scripts, popup, player, etc.
 */
export function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): boolean {
  console.log('Message received:', message.type, 'from:', sender.tab?.url || 'extension');

  switch (message.type) {
    case 'PLAY_VIDEO':
      handlePlayVideo(message.payload as { url: string; sourceUrl?: string; sourceTabId?: number }, sender, sendResponse);
      break;

    case 'GET_HISTORY':
      handleGetHistory(sendResponse);
      break;

    case 'GET_SERIES':
      handleGetSeries(sendResponse);
      break;

    case 'SAVE_PROGRESS':
      handleSaveProgress(message.payload, sendResponse);
      break;

    case 'START_DOWNLOAD':
      handleStartDownload(message.payload as { url: string }, sendResponse);
      break;

    case 'GET_DOWNLOAD_STATUS':
      handleGetDownloadStatus(message.payload as { downloadId: number }, sendResponse);
      break;

    case 'SCAN_SOURCE_PAGE':
      handleScanSourcePage(message.payload as { videoUrl: string }, sendResponse);
      break;

    case 'REGISTER_VIDEO_SOURCE':
      handleRegisterVideoSource(message.payload as { videoUrl: string; sourceUrl: string; sourceTabId?: number }, sendResponse);
      break;

    case 'GET_VIDEO_SOURCE':
      handleGetVideoSource(message.payload as { videoUrl: string }, sendResponse);
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }

  // Return true to indicate async response
  return true;
}

/**
 * Open video in player
 */
function handlePlayVideo(
  payload: { url: string; sourceUrl?: string; sourceTabId?: number },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): void {
  const playerPage = chrome.runtime.getURL('index.html');
  const params = new URLSearchParams({ url: payload.url });
  const playerUrl = `${playerPage}?${params.toString()}`;

  // Store the source page info
  const sourceUrl = payload.sourceUrl || sender.tab?.url;
  const sourceTabId = payload.sourceTabId || sender.tab?.id;

  if (sourceUrl) {
    videoSourceMap.set(payload.url, {
      sourceUrl,
      sourceTabId,
      timestamp: Date.now(),
    });
    console.log('Stored video source:', payload.url, '->', sourceUrl);
  }

  chrome.tabs.create({ url: playerUrl, active: true }, (tab) => {
    sendResponse({ success: true, tabId: tab?.id });
  });
}

/**
 * Get watch history (placeholder - will be implemented with Firebase)
 */
function handleGetHistory(sendResponse: (response: unknown) => void): void {
  // TODO: Implement with Firebase in Phase 5
  sendResponse({ history: [] });
}

/**
 * Get series list (placeholder - will be implemented with Firebase)
 */
function handleGetSeries(sendResponse: (response: unknown) => void): void {
  // TODO: Implement with Firebase in Phase 6
  sendResponse({ series: [] });
}

/**
 * Save video progress (placeholder - will be implemented with Firebase)
 */
function handleSaveProgress(
  payload: unknown,
  sendResponse: (response: unknown) => void
): void {
  // TODO: Implement with Firebase in Phase 5
  console.log('Save progress:', payload);
  sendResponse({ success: true });
}

/**
 * Start downloading a video
 */
function handleStartDownload(
  payload: { url: string },
  sendResponse: (response: unknown) => void
): void {
  chrome.downloads.download(
    { url: payload.url },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    }
  );
}

/**
 * Get download status
 */
function handleGetDownloadStatus(
  payload: { downloadId: number },
  sendResponse: (response: unknown) => void
): void {
  chrome.downloads.search({ id: payload.downloadId }, (downloads) => {
    if (downloads.length > 0) {
      const download = downloads[0];
      sendResponse({
        id: download.id,
        state: download.state,
        bytesReceived: download.bytesReceived,
        totalBytes: download.totalBytes,
        filename: download.filename,
      });
    } else {
      sendResponse({ error: 'Download not found' });
    }
  });
}

/**
 * Register a video's source page (called when opening a video)
 */
function handleRegisterVideoSource(
  payload: { videoUrl: string; sourceUrl: string; sourceTabId?: number },
  sendResponse: (response: unknown) => void
): void {
  videoSourceMap.set(payload.videoUrl, {
    sourceUrl: payload.sourceUrl,
    sourceTabId: payload.sourceTabId,
    timestamp: Date.now(),
  });
  console.log('Registered video source:', payload.videoUrl, '->', payload.sourceUrl);
  sendResponse({ success: true });
}

/**
 * Get the source page for a video
 */
function handleGetVideoSource(
  payload: { videoUrl: string },
  sendResponse: (response: unknown) => void
): void {
  const source = videoSourceMap.get(payload.videoUrl);
  if (source) {
    sendResponse({ success: true, ...source });
  } else {
    sendResponse({ success: false, error: 'Source not found' });
  }
}

/**
 * Scan the source page for other video links
 */
function handleScanSourcePage(
  payload: { videoUrl: string },
  sendResponse: (response: unknown) => void
): void {
  const source = videoSourceMap.get(payload.videoUrl);

  if (!source) {
    // Try to find a tab with the video URL's domain
    const videoUrlObj = new URL(payload.videoUrl);
    const videoDomain = videoUrlObj.hostname;

    chrome.tabs.query({}, (tabs) => {
      // Find tabs that might be the source
      const candidateTabs = tabs.filter(tab => {
        if (!tab.url) return false;
        try {
          const tabUrl = new URL(tab.url);
          return tabUrl.hostname === videoDomain || tabUrl.hostname.endsWith('.' + videoDomain);
        } catch {
          return false;
        }
      });

      if (candidateTabs.length > 0) {
        // Use the most recently active matching tab
        const targetTab = candidateTabs[0];
        scanTabForVideos(targetTab.id!, payload.videoUrl, sendResponse);
      } else {
        sendResponse({
          success: false,
          error: 'No source page found',
          videoUrl: payload.videoUrl,
        });
      }
    });
    return;
  }

  // We have a stored source - try to use the stored tab or find a matching one
  if (source.sourceTabId) {
    chrome.tabs.get(source.sourceTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        // Tab no longer exists, try to find one with the source URL
        findAndScanTab(source.sourceUrl, payload.videoUrl, sendResponse);
      } else {
        scanTabForVideos(source.sourceTabId!, payload.videoUrl, sendResponse);
      }
    });
  } else {
    findAndScanTab(source.sourceUrl, payload.videoUrl, sendResponse);
  }
}

/**
 * Find a tab with a given URL and scan it
 */
function findAndScanTab(
  sourceUrl: string,
  videoUrl: string,
  sendResponse: (response: unknown) => void
): void {
  const sourceUrlObj = new URL(sourceUrl);

  chrome.tabs.query({}, (tabs) => {
    // Find tabs with the same origin
    const matchingTabs = tabs.filter(tab => {
      if (!tab.url) return false;
      try {
        const tabUrl = new URL(tab.url);
        return tabUrl.origin === sourceUrlObj.origin;
      } catch {
        return false;
      }
    });

    if (matchingTabs.length > 0) {
      // Prefer exact URL match, otherwise use first matching origin
      const exactMatch = matchingTabs.find(t => t.url === sourceUrl);
      const targetTab = exactMatch || matchingTabs[0];
      scanTabForVideos(targetTab.id!, videoUrl, sendResponse);
    } else {
      sendResponse({
        success: false,
        error: 'Source tab not found',
        sourceUrl,
        videoUrl,
      });
    }
  });
}

/**
 * Scan a specific tab for video links
 */
function scanTabForVideos(
  tabId: number,
  videoUrl: string,
  sendResponse: (response: unknown) => void
): void {
  // First try to send message directly
  chrome.tabs.sendMessage(
    tabId,
    { type: 'SCAN_FOR_EPISODES', payload: { currentUrl: videoUrl } },
    (response) => {
      if (chrome.runtime.lastError) {
        console.log('Content script not loaded, injecting...', chrome.runtime.lastError.message);
        // Content script not loaded - inject it first
        injectContentScriptAndScan(tabId, videoUrl, sendResponse);
      } else {
        sendResponse({
          success: true,
          videoUrl,
          ...response,
        });
      }
    }
  );
}

/**
 * Inject content script and then scan for videos
 */
function injectContentScriptAndScan(
  tabId: number,
  videoUrl: string,
  sendResponse: (response: unknown) => void
): void {
  chrome.scripting.executeScript(
    {
      target: { tabId },
      files: ['content.js'],
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to inject content script:', chrome.runtime.lastError);
        sendResponse({
          success: false,
          error: 'Failed to inject content script: ' + chrome.runtime.lastError.message,
          videoUrl,
        });
        return;
      }

      // Wait a bit for the script to initialize, then send message
      setTimeout(() => {
        chrome.tabs.sendMessage(
          tabId,
          { type: 'SCAN_FOR_EPISODES', payload: { currentUrl: videoUrl } },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('Still failed after injection:', chrome.runtime.lastError);
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message,
                videoUrl,
              });
            } else {
              sendResponse({
                success: true,
                videoUrl,
                ...response,
              });
            }
          }
        );
      }, 100);
    }
  );
}
