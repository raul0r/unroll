// popup.js - ThreadKeeper Popup Logic

class PopupManager {
  constructor() {
    this.threads = {};
    this.filteredThreads = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.user = null;
    this.stats = null;
    
    this.elements = {
      threadList: document.getElementById('threadList'),
      threadItems: document.getElementById('threadItems'),
      loadingState: document.getElementById('loadingState'),
      emptyState: document.getElementById('emptyState'),
      searchInput: document.getElementById('searchInput'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      threadCount: document.getElementById('threadCount'),
      tweetCount: document.getElementById('tweetCount'),
      storageUsed: document.getElementById('storageUsed'),
      storageFill: document.getElementById('storageFill'),
      storageText: document.getElementById('storageText'),
      upgradeBtn: document.getElementById('upgradeBtn'),
      exportAllBtn: document.getElementById('exportAllBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      openSidebarBtn: document.getElementById('openSidebarBtn'),
      visitTwitterBtn: document.getElementById('visitTwitterBtn')
    };
    
    this.init();
  }

  async init() {
    try {
      // Initialize storage
      await window.ThreadKeeperStorage.initialize();
      
      // Load user data
      this.user = await window.ThreadKeeperStorage.getUser();
      
      // Load threads and stats
      await this.loadThreads();
      await this.updateStats();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Apply filters
      this.applyFilters();
      
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      this.showError('Failed to load threads');
    }
  }

  async loadThreads() {
    try {
      this.threads = await window.ThreadKeeperStorage.getThreads();
      this.filteredThreads = Object.values(this.threads);
      
      // Sort by saved date (newest first)
      this.filteredThreads.sort((a, b) => b.savedAt - a.savedAt);
      
    } catch (error) {
      console.error('Failed to load threads:', error);
      this.threads = {};
      this.filteredThreads = [];
    }
  }

  async updateStats() {
    try {
      this.stats = await window.ThreadKeeperStorage.getStats();
      
      // Update UI
      this.elements.threadCount.textContent = this.stats.totalThreads;
      this.elements.tweetCount.textContent = this.stats.totalTweets;
      
      // Format storage size
      const storageKB = Math.round(this.stats.storageUsed / 1024);
      const storageMB = (this.stats.storageUsed / (1024 * 1024)).toFixed(1);
      this.elements.storageUsed.textContent = 
        storageKB < 1024 ? `${storageKB} KB` : `${storageMB} MB`;
      
      // Update storage indicator
      this.updateStorageIndicator();
      
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  }

  updateStorageIndicator() {
    const maxFreeThreads = 50;
    const threadCount = this.stats.totalThreads;
    const percentage = Math.min((threadCount / maxFreeThreads) * 100, 100);
    
    this.elements.storageFill.style.width = `${percentage}%`;
    
    if (this.user?.isPremium) {
      this.elements.storageText.textContent = `${threadCount} threads (Premium)`;
      this.elements.storageFill.style.background = '#00BA7C';
      this.elements.upgradeBtn.style.display = 'none';
    } else {
      this.elements.storageText.textContent = `${threadCount}/${maxFreeThreads} threads (Free)`;
      
      if (threadCount >= maxFreeThreads) {
        this.elements.storageFill.style.background = '#F4212E';
        this.elements.upgradeBtn.style.display = 'flex';
      } else if (threadCount >= maxFreeThreads * 0.8) {
        this.elements.storageFill.style.background = '#FFD400';
        this.elements.upgradeBtn.style.display = 'flex';
      }
    }
  }

  setupEventListeners() {
    // Search
    this.elements.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.elements.clearSearchBtn.style.display = this.searchQuery ? 'flex' : 'none';
      this.applyFilters();
    });
    
    this.elements.clearSearchBtn.addEventListener('click', () => {
      this.searchQuery = '';
      this.elements.searchInput.value = '';
      this.elements.clearSearchBtn.style.display = 'none';
      this.applyFilters();
    });
    
    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentFilter = tab.dataset.filter;
        this.applyFilters();
      });
    });
    
    // Export all
    this.elements.exportAllBtn.addEventListener('click', () => {
      this.exportAllThreads();
    });
    
    // Settings
    this.elements.settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    
    // Open sidebar
    this.elements.openSidebarBtn.addEventListener('click', () => {
      this.openSidebar();
    });
    
    // Visit Twitter
    if (this.elements.visitTwitterBtn) {
      this.elements.visitTwitterBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://twitter.com' });
      });
    }
    
    // Upgrade button
    if (this.elements.upgradeBtn) {
      this.elements.upgradeBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://threadkeeper.app/upgrade' });
      });
    }
    
    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local') {
        this.handleStorageChange(changes);
      }
    });
  }

  applyFilters() {
    let filtered = Object.values(this.threads);
    
    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(thread => {
        return thread.authorUsername.toLowerCase().includes(query) ||
               thread.authorName.toLowerCase().includes(query) ||
               thread.tweets.some(tweet => tweet.text.toLowerCase().includes(query));
      });
    }
    
    // Apply tab filters
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    switch (this.currentFilter) {
      case 'recent':
        filtered = filtered.filter(thread => thread.savedAt > weekAgo);
        break;
      case 'collections':
        filtered = filtered.filter(thread => thread.collectionId !== 'default');
        break;
      case 'tagged':
        filtered = filtered.filter(thread => thread.tags.length > 0);
        break;
    }
    
    // Sort by saved date
    filtered.sort((a, b) => b.savedAt - a.savedAt);
    
    this.filteredThreads = filtered;
    this.renderThreads();
  }

  renderThreads() {
    // Hide loading state
    this.elements.loadingState.style.display = 'none';
    
    if (this.filteredThreads.length === 0) {
      // Show empty state
      this.elements.emptyState.style.display = 'flex';
      this.elements.threadItems.style.display = 'none';
      
      // Update empty state message based on context
      const emptyMessage = this.elements.emptyState.querySelector('p');
      if (this.searchQuery) {
        emptyMessage.textContent = 'No threads match your search';
      } else if (this.currentFilter !== 'all') {
        emptyMessage.textContent = 'No threads in this category';
      } else {
        emptyMessage.textContent = 'Visit Twitter/X and click the save button on any thread to get started!';
      }
    } else {
      // Show thread list
      this.elements.emptyState.style.display = 'none';
      this.elements.threadItems.style.display = 'block';
      
      // Clear existing items
      this.elements.threadItems.innerHTML = '';
      
      // Render threads
      this.filteredThreads.forEach(thread => {
        const item = this.createThreadItem(thread);
        this.elements.threadItems.appendChild(item);
      });
    }
  }

  createThreadItem(thread) {
    const template = document.getElementById('threadItemTemplate');
    const clone = template.content.cloneNode(true);
    const item = clone.querySelector('.thread-item');
    
    // Set thread ID
    item.dataset.threadId = thread.id;
    
    // Set avatar
    const avatar = item.querySelector('.thread-avatar img');
    avatar.src = thread.authorAvatar || 'assets/default-avatar.png';
    avatar.alt = thread.authorName;
    
    // Set author info
    item.querySelector('.author-name').textContent = thread.authorName;
    item.querySelector('.author-username').textContent = `@${thread.authorUsername}`;
    
    // Show verified badge if applicable
    if (thread.authorVerified) {
      item.querySelector('.verified-badge').style.display = 'inline-flex';
    }
    
    // Set metadata
    const savedDate = new Date(thread.savedAt);
    const dateStr = this.formatDate(savedDate);
    item.querySelector('.thread-date').textContent = dateStr;
    item.querySelector('.tweet-count').textContent = thread.tweets.length;
    
    // Set preview text
    const preview = thread.tweets[0]?.text || '';
    item.querySelector('.thread-preview').textContent = preview;
    
    // Add tags
    const tagsContainer = item.querySelector('.thread-tags');
    if (thread.tags && thread.tags.length > 0) {
      thread.tags.forEach(tagId => {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = tagId; // Would need to look up tag name
        tagsContainer.appendChild(tag);
      });
    }
    
    // Set up action buttons
    this.setupThreadActions(item, thread);
    
    // Click to view
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.thread-actions')) {
        this.viewThread(thread);
      }
    });
    
    return item;
  }

  setupThreadActions(item, thread) {
    // View button
    item.querySelector('.view-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.viewThread(thread);
    });
    
    // Export button
    item.querySelector('.export-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportThread(thread);
    });
    
    // Tag button
    item.querySelector('.tag-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.manageTags(thread);
    });
    
    // Delete button
    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteThread(thread);
    });
  }

  viewThread(thread) {
    // Open in new tab with thread viewer
    chrome.tabs.create({
      url: chrome.runtime.getURL(`sidebar/sidebar.html#thread/${thread.id}`)
    });
  }

  async exportThread(thread) {
    try {
      const format = 'markdown'; // Can be made configurable
      const content = await window.ThreadKeeperStorage.exportThread(thread.id, format);
      
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      
      const filename = `thread_${thread.authorUsername}_${Date.now()}.md`;
      
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });
      
      // Show success notification
      this.showNotification('Thread exported successfully');
      
    } catch (error) {
      console.error('Failed to export thread:', error);
      this.showError('Failed to export thread');
    }
  }

  async exportAllThreads() {
    try {
      const threads = Object.values(this.threads);
      let content = '# ThreadKeeper Export\n\n';
      content += `Exported on: ${new Date().toLocaleString()}\n`;
      content += `Total threads: ${threads.length}\n\n`;
      content += '---\n\n';
      
      for (const thread of threads) {
        const threadContent = await window.ThreadKeeperStorage.exportThread(thread.id, 'markdown');
        content += threadContent + '\n\n---\n\n';
      }
      
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      
      chrome.downloads.download({
        url: url,
        filename: `threadkeeper_export_${Date.now()}.md`,
        saveAs: true
      });
      
      this.showNotification('All threads exported successfully');
      
    } catch (error) {
      console.error('Failed to export threads:', error);
      this.showError('Failed to export threads');
    }
  }

  async deleteThread(thread) {
    if (confirm(`Delete thread by @${thread.authorUsername}?`)) {
      try {
        await window.ThreadKeeperStorage.deleteThread(thread.id);
        
        // Remove from local state
        delete this.threads[thread.id];
        
        // Refresh display
        await this.updateStats();
        this.applyFilters();
        
        this.showNotification('Thread deleted');
        
      } catch (error) {
        console.error('Failed to delete thread:', error);
        this.showError('Failed to delete thread');
      }
    }
  }

  manageTags(thread) {
    // TODO: Implement tag management UI
    console.log('Manage tags for thread:', thread);
  }

  openSidebar() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('sidebar/sidebar.html')
    });
  }

  handleStorageChange(changes) {
    // Reload data if threads changed
    if (changes.threads) {
      this.loadThreads().then(() => {
        this.applyFilters();
        this.updateStats();
      });
    }
  }

  formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 7) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  }

  showNotification(message) {
    // TODO: Implement notification UI
    console.log('Notification:', message);
  }

  showError(message) {
    // TODO: Implement error UI
    console.error('Error:', message);
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});