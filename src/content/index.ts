// StreamWatch Content Script
// Runs on every page to detect video links

const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.webm', '.avi', '.mov',
  '.m4v', '.flv', '.wmv', '.mpg', '.mpeg',
  '.3gp', '.ogv'
];

interface VideoLinkInfo {
  url: string;
  text: string;        // Link text
  title: string;       // Link title attribute
  filename: string;    // Extracted filename from URL
  nearbyText: string;  // Text around the link for context
}

/**
 * Check if URL is a video link
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
 * Extract filename from URL
 */
function extractFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = decodeURIComponent(urlObj.pathname);
    return pathname.split('/').pop() || '';
  } catch {
    return '';
  }
}

/**
 * Get text content near an element for context
 */
function getNearbyText(element: HTMLElement): string {
  // Get parent's text content (limited)
  const parent = element.parentElement;
  if (!parent) return '';

  // Get sibling text
  let text = '';
  const prevSibling = element.previousSibling;
  const nextSibling = element.nextSibling;

  if (prevSibling?.textContent) {
    text += prevSibling.textContent.trim().slice(-50) + ' ';
  }
  if (nextSibling?.textContent) {
    text += ' ' + nextSibling.textContent.trim().slice(0, 50);
  }

  // Also check for episode/chapter indicators in parent
  const parentText = parent.textContent || '';
  const episodeMatch = parentText.match(/[Ee]p(?:isode)?[\s.:]*(\d+)/);
  const chapterMatch = parentText.match(/[Cc]h(?:apter)?[\s.:]*(\d+)/);

  if (episodeMatch) text += ` Episode ${episodeMatch[1]}`;
  if (chapterMatch) text += ` Chapter ${chapterMatch[1]}`;

  return text.trim().slice(0, 100);
}

/**
 * Find all video links on the page with metadata
 */
function findVideoLinksWithInfo(): VideoLinkInfo[] {
  const links = document.querySelectorAll('a[href]');
  const videoLinks: VideoLinkInfo[] = [];
  const seenUrls = new Set<string>();

  links.forEach((link) => {
    const anchor = link as HTMLAnchorElement;
    const href = anchor.href;

    if (!isVideoUrl(href)) return;
    if (seenUrls.has(href)) return;

    seenUrls.add(href);

    videoLinks.push({
      url: href,
      text: anchor.textContent?.trim() || '',
      title: anchor.title || '',
      filename: extractFilename(href),
      nearbyText: getNearbyText(anchor),
    });
  });

  return videoLinks;
}

/**
 * Find all video links (URLs only)
 */
function findVideoLinks(): string[] {
  return findVideoLinksWithInfo().map(link => link.url);
}

/**
 * Store the referrer URL for the current tab
 * This helps us know where a video was originally found
 */
function getSourcePageInfo() {
  return {
    url: window.location.href,
    title: document.title,
    referrer: document.referrer,
  };
}

// Listen for messages from background script or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ status: 'ok' });
      break;

    case 'GET_VIDEO_LINKS':
      sendResponse({ links: findVideoLinks() });
      break;

    case 'GET_VIDEO_LINKS_WITH_INFO':
      sendResponse({ links: findVideoLinksWithInfo() });
      break;

    case 'GET_PAGE_INFO':
      sendResponse({
        ...getSourcePageInfo(),
        videoLinks: findVideoLinks(),
      });
      break;

    case 'GET_PAGE_INFO_DETAILED':
      sendResponse({
        ...getSourcePageInfo(),
        videoLinks: findVideoLinksWithInfo(),
      });
      break;

    case 'SCAN_FOR_EPISODES':
      // Scan page for video links that match a pattern
      const { currentUrl } = message.payload || {};
      const allLinks = findVideoLinksWithInfo();

      // If we have a current URL, try to find related episodes
      sendResponse({
        success: true,
        currentUrl,
        allLinks,
        pageUrl: window.location.href,
        pageTitle: document.title,
      });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
  return true; // Required for async sendResponse
});

// Store source page URL in session storage when navigating to a video
// This helps track where the video was found from
const currentUrl = window.location.href;
if (isVideoUrl(currentUrl)) {
  // We're on a direct video URL, store the referrer
  try {
    sessionStorage.setItem('streamwatch_source', JSON.stringify({
      videoUrl: currentUrl,
      sourceUrl: document.referrer,
      timestamp: Date.now(),
    }));
  } catch {
    // Session storage might not be available
  }
}

// Log when loaded (helpful for debugging)
console.log('StreamWatch content script loaded on:', window.location.hostname);

export {};
