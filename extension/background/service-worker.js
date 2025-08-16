// background/service-worker.js - ThreadKeeper Service Worker (Fixed)

// Constants
const API_BASE_URL = 'https://api.threadkeeper.app/v1';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

// State
let syncTimer = null;
let user = null;
let isAuthenticated = false;

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('ThreadKeeper installed/updated', details);
  
  try {
    if (details.reason === 'install') {
      // First installation
      await onFirstInstall();
    } else if (details.reason === 'update') {
      // Extension updated
      await onUpdate(details.previousVersion);
    }
    
    // Set up context menus
    createContextMenus();
    
    // Initialize badge
    updateBadge();
  } catch (error) {
    console.error('Installation error:', error);
  }
});

// First installation setup
async function onFirstInstall() {
  try {
    // Open welcome page
    await chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
    
    // Initialize storage with defaults
    await chrome.storage.local.set({
      installedAt: Date.now(),
      version: chrome.runtime.getManifest().version
    });
  } catch (error) {
    console.error('First install error:', error);
  }
}

// Handle extension updates
async function onUpdate(previousVersion) {
  console.log(`Updated from version ${previousVersion}`);
  // TODO: Add migration logic if needed
}

// Create context menus
function createContextMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      // Save thread menu item
      chrome.contextMenus.create({
        id: 'save-thread',
        title: 'Save Thread with ThreadKeeper',
        contexts: ['page', 'link'],
        documentUrlPatterns: ['*://twitter.com/*', '*://x.com/*']
      });
      
      // View saved threads menu item
      chrome.contextMenus.create({
        id: 'view-threads',
        title: 'View Saved Threads',
        contexts: ['all']
      });
    });
  } catch (error) {
    console.error('Context menu error:', error);
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  try {
    switch (info.menuItemId) {
      case 'save-thread':
        handleSaveThread(tab);
        break;
      case 'view-threads':
        openThreadViewer();
        break;
    }
  } catch (error) {
    console.error('Context menu click error:', error);
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.type);
  
  try {
    switch (request.type) {
      case 'THREAD_SAVED':
        handleThreadSaved(request.data);
        sendResponse({ success: true });
        break;
        
      case 'CHECK_AUTH':
        checkAuthentication().then(sendResponse).catch(error => {
          console.error('Auth check error:', error);
          sendResponse({ authenticated: false, error: error.message });
        });
        return true; // Will respond asynchronously
        
      case 'GET_USER':
        getUserData().then(sendResponse).catch(error => {
          console.error('Get user error:', error);
          sendResponse(null);
        });
        return true;
        
      case 'INIT':
        sendResponse({ initialized: true });
        break;
        
      default:
        console.log('Unknown message type:', request.type);
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Message handler error:', error);
    sendResponse({ error: error.message });
  }
});

// Handle thread saved
function handleThreadSaved(threadData) {
  try {
    console.log('Thread saved:', threadData);
    
    // Update badge
    updateBadge();
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icon-128.png',
      title: 'Thread Saved!',
      message: `Saved ${threadData.tweets.length} tweets from @${threadData.authorUsername}`,
      buttons: [
        { title: 'View' },
        { title: 'Dismiss' }
      ]
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.log('Notification error:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.error('Handle thread saved error:', error);
  }
}

// Handle save thread from context menu
async function handleSaveThread(tab) {
  try {
    // Check if on Twitter/X
    if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icon-128.png',
        title: 'Invalid Page',
        message: 'ThreadKeeper only works on Twitter/X'
      });
      return;
    }
    
    // Send message to content script to save thread
    chrome.tabs.sendMessage(tab.id, {
      type: 'SAVE_CURRENT_THREAD'
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Content script message error:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.error('Handle save thread error:', error);
  }
}

// Open thread viewer
function openThreadViewer() {
  try {
    chrome.tabs.create({
      url: chrome.runtime.getURL('sidebar/sidebar.html')
    });
  } catch (error) {
    console.error('Open thread viewer error:', error);
  }
}

// Update extension badge
async function updateBadge() {
  try {
    const data = await chrome.storage.local.get('metadata');
    const threadCount = data.metadata?.threadCount || 0;
    
    if (threadCount > 0) {
      await chrome.action.setBadgeText({ text: threadCount.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: '#1D9BF0' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('Failed to update badge:', error);
  }
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  try {
    if (buttonIndex === 0) {
      // View button clicked
      openThreadViewer();
    }
    chrome.notifications.clear(notificationId);
  } catch (error) {
    console.error('Notification button click error:', error);
  }
});

// Check authentication status
async function checkAuthentication() {
  try {
    const data = await chrome.storage.local.get('auth');
    if (!data.auth?.token) {
      return { authenticated: false };
    }
    
    // For now, just return the stored auth data
    // In production, you'd verify with the server
    user = data.auth.user;
    isAuthenticated = true;
    return { authenticated: true, user };
    
  } catch (error) {
    console.error('Auth check error:', error);
    return { authenticated: false };
  }
}

// Get user data
async function getUserData() {
  try {
    const data = await chrome.storage.local.get('auth');
    return data.auth?.user || null;
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

// Handle extension startup
chrome.runtime.onStartup.addListener(async () => {
  try {
    console.log('Extension started');
    
    // Check authentication
    const authStatus = await checkAuthentication();
    if (authStatus.authenticated && authStatus.user?.isPremium) {
      // startSync(); // Implement if needed
    }
    
    // Update badge
    updateBadge();
  } catch (error) {
    console.error('Startup error:', error);
  }
});

// Handle tab updates (for injecting content scripts if needed)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    if (changeInfo.status === 'complete') {
      // Check if Twitter/X page
      if (tab.url && (tab.url.includes('twitter.com') || tab.url.includes('x.com'))) {
        // Content scripts are automatically injected via manifest
        // But we can send a message to ensure they're ready
        chrome.tabs.sendMessage(tabId, { type: 'INIT' }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script not ready or not injected
            console.log('Content script not ready for tab:', tabId);
          }
        });
      }
    }
  } catch (error) {
    console.error('Tab update error:', error);
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  try {
    console.log('Command received:', command);
    
    switch (command) {
      case 'save-thread':
        // Get active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            handleSaveThread(tabs[0]);
          }
        });
        break;
        
      case 'open-viewer':
        openThreadViewer();
        break;
    }
  } catch (error) {
    console.error('Command error:', error);
  }
});

// Handle uninstall
chrome.runtime.setUninstallURL('https://threadkeeper.app/goodbye');

console.log('ThreadKeeper service worker initialized');