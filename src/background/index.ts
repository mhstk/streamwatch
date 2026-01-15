// StreamWatch Background Service Worker
import { setupContextMenu, handleContextMenuClick } from './contextMenu';
import { handleMessage } from './messageHandler';

console.log('StreamWatch service worker initialized');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('StreamWatch installed:', details.reason);

  // Set up context menus
  setupContextMenu();

  // Initialize default settings on first install
  if (details.reason === 'install') {
    console.log('First install - setting up defaults');
  }
});

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// Listen for messages from other parts of the extension
chrome.runtime.onMessage.addListener(handleMessage);

// Keep service worker alive and re-setup context menus on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('StreamWatch service worker started');
  setupContextMenu();
});

export {};
