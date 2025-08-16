// background/service-worker.js - ThreadKeeper Service Worker

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
});

// First installation setup
async function onFirstInstall() {
  // Open welcome page
  chrome.tabs.create({
    url: chrome.runtime.getURL('welcome.html')
  });
  
  // Initialize storage with defaults
  await chrome.storage.local.set({
    installedAt: Date.now(),
    version: chrome.runtime.getManifest().version
  });
}

// Handle extension updates
async function onUpdate(previousVersion) {
  console.log(`Updated from version ${previousVersion}`);
  
  // Perform any necessary migrations
  // TODO: Add migration logic if needed
}

// Create context menus
function createContextMenus() {
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
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'save-thread':
      handleSaveThread(tab);
      break;
    case 'view-threads':
      openThreadViewer();
      break;
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.type);
  
  switch (request.type) {
    case 'THREAD_SAVED':
      handleThreadSaved(request.data);
      break;
      
    case 'AUTHENTICATE':
      handleAuthentication(request.data).then(sendResponse);
      return true; // Will respond asynchronously
      
    case 'SYNC_THREADS':
      syncThreads().then(sendResponse);
      return true;
      
    case 'GET_USER':
      getUserData().then(sendResponse);
      return true;
      
    case 'LOGOUT':
      handleLogout().then(sendResponse);
      return true;
      
    case 'CHECK_AUTH':
      checkAuthentication().then(sendResponse);
      return true;
      
    default:
      console.log('Unknown message type:', request.type);
  }
});

// Handle thread saved
function handleThreadSaved(threadData) {
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
  });
  
  // Sync if user is premium
  if (user?.isPremium) {
    scheduleSyncUpdate();
  }
}

// Handle save thread from context menu
async function handleSaveThread(tab) {
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
  });
}

// Open thread viewer
function openThreadViewer() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('sidebar/sidebar.html')
  });
}

// Update extension badge
async function updateBadge() {
  try {
    const data = await chrome.storage.local.get('metadata');
    const threadCount = data.metadata?.threadCount || 0;
    
    if (threadCount > 0) {
      chrome.action.setBadgeText({ text: threadCount.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#1D9BF0' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('Failed to update badge:', error);
  }
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // View button clicked
    openThreadViewer();
  }
  chrome.notifications.clear(notificationId);
});

// Authentication handling
async function handleAuthentication(credentials) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });
    
    if (!response.ok) {
      throw new Error('Authentication failed');
    }
    
    const data = await response.json();
    
    // Store auth data
    await chrome.storage.local.set({
      auth: {
        token: data.token,
        refreshToken: data.refreshToken,
        user: data.user
      }
    });
    
    user = data.user;
    isAuthenticated = true;
    
    // Start syncing if premium
    if (user.isPremium) {
      startSync();
    }
    
    return { success: true, user };
    
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: error.message };
  }
}

// Check authentication status
async function checkAuthentication() {
  try {
    const data = await chrome.storage.local.get('auth');
    if (!data.auth?.token) {
      return { authenticated: false };
    }
    
    // Verify token with server
    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${data.auth.token}`
      }
    });
    
    if (response.ok) {
      const userData = await response.json();
      user = userData.user;
      isAuthenticated = true;
      return { authenticated: true, user };
    } else if (response.status === 401) {
      // Try to refresh token
      return await refreshAuthToken();
    }
    
    return { authenticated: false };
    
  } catch (error) {
    console.error('Auth check error:', error);
    return { authenticated: false };
  }
}

// Refresh authentication token
async function refreshAuthToken() {
  try {
    const data = await chrome.storage.local.get('auth');
    if (!data.auth?.refreshToken) {
      return { authenticated: false };
    }
    
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refreshToken: data.auth.refreshToken
      })
    });
    
    if (response.ok) {
      const newData = await response.json();
      
      // Update stored auth
      await chrome.storage.local.set({
        auth: {
          ...data.auth,
          token: newData.token
        }
      });
      
      return { authenticated: true, user: data.auth.user };
    }
    
    // Refresh failed, clear auth
    await handleLogout();
    return { authenticated: false };
    
  } catch (error) {
    console.error('Token refresh error:', error);
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

// Handle logout
async function handleLogout() {
  try {
    // Clear auth data
    await chrome.storage.local.remove('auth');
    
    // Stop syncing
    stopSync();
    
    user = null;
    isAuthenticated = false;
    
    return { success: true };
    
  } catch (error) {
    console.error('Logout error:', error);
    return { success: false, error: error.message };
  }
}

// Sync threads with server (for premium users)
async function syncThreads() {
  if (!user?.isPremium) {
    return { success: false, error: 'Premium required' };
  }
  
  try {
    const data = await chrome.storage.local.get(['threads', 'auth', 'syncState']);
    const threads = data.threads || {};
    const auth = data.auth;
    const syncState = data.syncState || { lastSync: null, pendingChanges: [] };
    
    if (!auth?.token) {
      return { success: false, error: 'Not authenticated' };
    }
    
    // Get threads modified since last sync
    const modifiedThreads = Object.values(threads).filter(thread => {
      return !syncState.lastSync || thread.lastModified > syncState.lastSync;
    });
    
    if (modifiedThreads.length === 0 && syncState.pendingChanges.length === 0) {
      console.log('No changes to sync');
      return { success: true, synced: 0 };
    }
    
    // Send to server
    const response = await fetch(`${API_BASE_URL}/sync/threads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        threads: modifiedThreads,
        changes: syncState.pendingChanges,
        lastSync: syncState.lastSync
      })
    });
    
    if (!response.ok) {
      throw new Error('Sync failed');
    }
    
    const result = await response.json();
    
    // Merge server changes
    if (result.threads && result.threads.length > 0) {
      const updatedThreads = { ...threads };
      result.threads.forEach(thread => {
        updatedThreads[thread.id] = thread;
      });
      
      await chrome.storage.local.set({ threads: updatedThreads });
    }
    
    // Update sync state
    await chrome.storage.local.set({
      syncState: {
        lastSync: Date.now(),
        pendingChanges: []
      }
    });
    
    console.log(`Synced ${modifiedThreads.length} threads`);
    return { success: true, synced: modifiedThreads.length };
    
  } catch (error) {
    console.error('Sync error:', error);
    return { success: false, error: error.message };
  }
}

// Start automatic syncing
function startSync() {
  if (syncTimer) return;
  
  // Initial sync
  syncThreads();
  
  // Set up periodic sync
  syncTimer = setInterval(() => {
    syncThreads();
  }, SYNC_INTERVAL);
  
  console.log('Sync started');
}

// Stop automatic syncing
function stopSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('Sync stopped');
  }
}

// Schedule a sync update (debounced)
let syncUpdateTimer = null;
function scheduleSyncUpdate() {
  if (!user?.isPremium) return;
  
  // Clear existing timer
  if (syncUpdateTimer) {
    clearTimeout(syncUpdateTimer);
  }
  
  // Schedule sync after 5 seconds of inactivity
  syncUpdateTimer = setTimeout(() => {
    syncThreads();
  }, 5000);
}

// Handle extension startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension started');
  
  // Check authentication
  const authStatus = await checkAuthentication();
  if (authStatus.authenticated && authStatus.user?.isPremium) {
    startSync();
  }
  
  // Update badge
  updateBadge();
});

// Handle tab updates (for injecting content scripts if needed)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
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
});

// Handle extension icon click (in addition to popup)
chrome.action.onClicked.addListener((tab) => {
  // This won't fire if popup is set in manifest
  // But useful for fallback behavior
  openThreadViewer();
});

// Alarm for periodic tasks (more reliable than setInterval)
chrome.alarms.create('sync', { periodInMinutes: 5 });
chrome.alarms.create('cleanup', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case 'sync':
      if (user?.isPremium) {
        syncThreads();
      }
      break;
      
    case 'cleanup':
      performCleanup();
      break;
  }
});

// Cleanup old data
async function performCleanup() {
  try {
    const data = await chrome.storage.local.get(['threads', 'metadata']);
    const threads = data.threads || {};
    const metadata = data.metadata || {};
    
    // Remove threads older than 90 days for free users
    if (!user?.isPremium) {
      const cutoffDate = Date.now() - (90 * 24 * 60 * 60 * 1000);
      let removed = 0;
      
      Object.keys(threads).forEach(id => {
        if (threads[id].savedAt < cutoffDate) {
          delete threads[id];
          removed++;
        }
      });
      
      if (removed > 0) {
        metadata.threadCount = Object.keys(threads).length;
        await chrome.storage.local.set({ threads, metadata });
        console.log(`Cleaned up ${removed} old threads`);
      }
    }
    
    // Clear old pending changes
    const syncState = await chrome.storage.local.get('syncState');
    if (syncState.syncState?.pendingChanges) {
      const recentChanges = syncState.syncState.pendingChanges.filter(
        change => change.timestamp > Date.now() - (24 * 60 * 60 * 1000)
      );
      
      if (recentChanges.length !== syncState.syncState.pendingChanges.length) {
        await chrome.storage.local.set({
          syncState: {
            ...syncState.syncState,
            pendingChanges: recentChanges
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Listen for web navigation to detect Twitter/X navigation
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.url.includes('twitter.com') || details.url.includes('x.com')) {
    // Send message to content script about navigation
    chrome.tabs.sendMessage(details.tabId, {
      type: 'NAVIGATION_CHANGE',
      url: details.url
    });
  }
}, {
  url: [
    { hostSuffix: 'twitter.com' },
    { hostSuffix: 'x.com' }
  ]
});

// Handle uninstall
chrome.runtime.setUninstallURL('https://threadkeeper.app/goodbye');

console.log('ThreadKeeper service worker initialized');