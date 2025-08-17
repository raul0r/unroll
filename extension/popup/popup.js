// popup.js - ThreadKeeper Popup Logic (Fixed Export)

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
      if (this.elements.upgradeBtn) this.elements.upgradeBtn.style.display = 'none';
    } else {
      this.elements.storageText.textContent = `${threadCount}/${maxFreeThreads} threads (Free)`;
      
      if (threadCount >= maxFreeThreads) {
        this.elements.storageFill.style.background = '#F4212E';
        if (this.elements.upgradeBtn) this.elements.upgradeBtn.style.display = 'flex';
      } else if (threadCount >= maxFreeThreads * 0.8) {
        this.elements.storageFill.style.background = '#FFD400';
        if (this.elements.upgradeBtn) this.elements.upgradeBtn.style.display = 'flex';
      }
    }
  }

  setupEventListeners() {
    // Search
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (this.elements.clearSearchBtn) {
          this.elements.clearSearchBtn.style.display = this.searchQuery ? 'flex' : 'none';
        }
        this.applyFilters();
      });
    }
    
    if (this.elements.clearSearchBtn) {
      this.elements.clearSearchBtn.addEventListener('click', () => {
        this.searchQuery = '';
        this.elements.searchInput.value = '';
        this.elements.clearSearchBtn.style.display = 'none';
        this.applyFilters();
      });
    }
    
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
    if (this.elements.exportAllBtn) {
      this.elements.exportAllBtn.addEventListener('click', () => {
        this.exportAllThreads();
      });
    }
    
    // Settings
    if (this.elements.settingsBtn) {
      this.elements.settingsBtn.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        }
      });
    }
    
    // Open sidebar
    if (this.elements.openSidebarBtn) {
      this.elements.openSidebarBtn.addEventListener('click', () => {
        this.openSidebar();
      });
    }
    
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

  async applyFilters() {
    let filtered = Object.values(this.threads);
    
    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      
      // Get all tags for tag search
      let allTags = {};
      try {
        allTags = await window.ThreadKeeperStorage.getTags();
      } catch (error) {
        console.error('Failed to load tags for search:', error);
      }
      
      filtered = filtered.filter(thread => {
        // Search in thread content
        const contentMatch = thread.authorUsername.toLowerCase().includes(query) ||
                             thread.authorName.toLowerCase().includes(query) ||
                             thread.tweets.some(tweet => tweet.text.toLowerCase().includes(query));
        
        // Search in tags
        let tagMatch = false;
        if (thread.tags && thread.tags.length > 0) {
          tagMatch = thread.tags.some(tagId => {
            const tag = allTags[tagId];
            return tag && tag.name.toLowerCase().includes(query);
          });
        }
        
        return contentMatch || tagMatch;
      });
    }
    
    // Apply tab filters
    const now = Date.now();
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    switch (this.currentFilter) {
      case 'recent':
        filtered = filtered.filter(thread => thread.savedAt > weekAgo);
        break;
      case 'collections':
        filtered = filtered.filter(thread => thread.collectionId !== 'default');
        break;
      case 'tagged':
        filtered = filtered.filter(thread => thread.tags && thread.tags.length > 0);
        break;
    }
    
    // Sort by saved date
    filtered.sort((a, b) => b.savedAt - a.savedAt);
    
    this.filteredThreads = filtered;
    this.renderThreads();
  }

  renderThreads() {
    // Hide loading state
    if (this.elements.loadingState) {
      this.elements.loadingState.style.display = 'none';
    }
    
    if (this.filteredThreads.length === 0) {
      // Show empty state
      if (this.elements.emptyState) {
        this.elements.emptyState.style.display = 'flex';
      }
      if (this.elements.threadItems) {
        this.elements.threadItems.style.display = 'none';
      }
      
      // Update empty state message based on context
      const emptyMessage = document.querySelector('#emptyState p');
      if (emptyMessage) {
        if (this.searchQuery) {
          emptyMessage.textContent = 'No threads match your search';
        } else if (this.currentFilter !== 'all') {
          emptyMessage.textContent = 'No threads in this category';
        } else {
          emptyMessage.textContent = 'Visit Twitter/X and click the save button on any thread to get started!';
        }
      }
    } else {
      // Show thread list
      if (this.elements.emptyState) {
        this.elements.emptyState.style.display = 'none';
      }
      if (this.elements.threadItems) {
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
  }

  createThreadItem(thread) {
    const template = document.getElementById('threadItemTemplate');
    if (!template) {
      console.error('Thread item template not found');
      return document.createElement('div');
    }
    
    const clone = template.content.cloneNode(true);
    const item = clone.querySelector('.thread-item');
    
    // Set thread ID
    item.dataset.threadId = thread.id;
    
    // Set avatar
    const avatar = item.querySelector('.thread-avatar img');
    if (avatar) {
      avatar.src = thread.authorAvatar || 'assets/default-avatar.png';
      avatar.alt = thread.authorName;
    }
    
    // Set author info
    const authorName = item.querySelector('.author-name');
    const authorUsername = item.querySelector('.author-username');
    if (authorName) authorName.textContent = thread.authorName;
    if (authorUsername) authorUsername.textContent = `@${thread.authorUsername}`;
    
    // Show verified badge if applicable
    if (thread.authorVerified) {
      const badge = item.querySelector('.verified-badge');
      if (badge) badge.style.display = 'inline-flex';
    }
    
    // Set metadata
    const savedDate = new Date(thread.savedAt);
    const dateStr = this.formatDate(savedDate);
    const threadDate = item.querySelector('.thread-date');
    const tweetCount = item.querySelector('.tweet-count');
    if (threadDate) threadDate.textContent = dateStr;
    if (tweetCount) tweetCount.textContent = thread.tweets ? thread.tweets.length : 0;
    
    // Set preview text
    const preview = thread.tweets && thread.tweets[0] ? thread.tweets[0].text : '';
    const previewEl = item.querySelector('.thread-preview');
    if (previewEl) previewEl.textContent = preview;
    
    // Set up action buttons
    this.setupThreadActions(item, thread);
    
    // Render tags
    this.renderThreadTags(item, thread);
    
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
    const viewBtn = item.querySelector('.view-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.viewThread(thread);
      });
    }
    
    // Export button
    const exportBtn = item.querySelector('.export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.exportThread(thread);
      });
    }
    
    // Tag button
    const tagBtn = item.querySelector('.tag-btn');
    if (tagBtn) {
      tagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manageTags(thread);
      });
    }
    
    // Delete button
    const deleteBtn = item.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteThread(thread);
      });
    }
  }

  viewThread(thread) {
    // Open in new tab with thread viewer
    chrome.tabs.create({
      url: chrome.runtime.getURL(`sidebar/sidebar.html#thread/${thread.id}`)
    });
  }

  // Export thread method - simple and working
  async exportThread(thread) {
    try {
      console.log('Exporting thread:', thread);
      
      // Simple text export
      let content = `Thread by @${thread.authorUsername} (${thread.authorName})\n`;
      content += `Saved on: ${new Date(thread.savedAt).toLocaleString()}\n`;
      content += `URL: ${thread.url || 'N/A'}\n`;
      content += `${'='.repeat(50)}\n\n`;
      
      if (thread.tweets && Array.isArray(thread.tweets)) {
        thread.tweets.forEach((tweet, index) => {
          content += `[${index + 1}/${thread.tweets.length}]\n`;
          content += `${tweet.text || 'No text'}\n`;
          if (tweet.timestamp) {
            content += `(${new Date(tweet.timestamp).toLocaleString()})\n`;
          }
          content += '\n';
        });
      } else {
        content += 'No tweets found in this thread.\n';
      }
      
      // Create and download file
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const filename = `thread_${thread.authorUsername || 'unknown'}_${Date.now()}.txt`;
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
      
      console.log('Export completed successfully');
      
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    }
  }

  generateExportContent(thread, format) {
    if (format === 'markdown') {
      let content = `# Thread by @${thread.authorUsername}\n\n`;
      content += `**Author:** ${thread.authorName}\n`;
      content += `**Date Saved:** ${new Date(thread.savedAt).toLocaleString()}\n`;
      content += `**Original URL:** [View on Twitter](${thread.url})\n\n`;
      content += `---\n\n`;
      
      if (thread.tweets && thread.tweets.length > 0) {
        thread.tweets.forEach((tweet, index) => {
          content += `## Tweet ${index + 1}/${thread.tweets.length}\n\n`;
          content += `${tweet.text}\n\n`;
          
          if (tweet.media && tweet.media.length > 0) {
            content += `**Media:** ${tweet.media.length} attachment(s)\n\n`;
          }
          
          if (tweet.timestamp) {
            content += `*${new Date(tweet.timestamp).toLocaleString()}*\n\n`;
          }
        });
      }
      
      return content;
    } else {
      // Plain text format
      let content = `Thread by @${thread.authorUsername} (${thread.authorName})\n`;
      content += `Saved on: ${new Date(thread.savedAt).toLocaleString()}\n`;
      content += `URL: ${thread.url}\n`;
      content += `${'='.repeat(50)}\n\n`;
      
      if (thread.tweets && thread.tweets.length > 0) {
        thread.tweets.forEach((tweet, index) => {
          content += `[${index + 1}/${thread.tweets.length}]\n`;
          content += `${tweet.text}\n`;
          if (tweet.timestamp) {
            content += `(${new Date(tweet.timestamp).toLocaleString()})\n`;
          }
          content += '\n';
        });
      }
      
      return content;
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
        const threadContent = this.generateExportContent(thread, 'markdown');
        content += threadContent + '\n\n---\n\n';
      }
      
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      
      const filename = `threadkeeper_export_${Date.now()}.md`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
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

  async manageTags(thread) {
    this.currentThread = thread;
    this.modalChanges = {
      added: new Set(),
      removed: new Set()
    };
    
    // Load tags and show modal
    await this.loadTagModal();
    this.showTagModal();
  }

  async loadTagModal() {
    try {
      // Get all tags and thread's current tags
      const [allTags, threadTags] = await Promise.all([
        window.ThreadKeeperStorage.getTags(),
        window.ThreadKeeperStorage.getThreadTags(this.currentThread.id)
      ]);
      
      this.allTags = Object.values(allTags);
      this.threadTags = threadTags.map(tag => tag.id);
      
      // Update modal content
      this.updateThreadInfo();
      this.renderTagLists();
      
    } catch (error) {
      console.error('Failed to load tags:', error);
      this.showError('Failed to load tags');
    }
  }

  updateThreadInfo() {
    const modal = document.getElementById('tagModal');
    const avatar = modal.querySelector('#modalThreadAvatar');
    const authorName = modal.querySelector('#modalThreadAuthor');
    const username = modal.querySelector('#modalThreadUsername');
    
    if (avatar) avatar.src = this.currentThread.authorAvatar || '';
    if (authorName) authorName.textContent = this.currentThread.authorName;
    if (username) username.textContent = `@${this.currentThread.authorUsername}`;
  }

  renderTagLists() {
    this.renderAssignedTags();
    this.renderAvailableTags();
  }

  renderAssignedTags() {
    const container = document.getElementById('assignedTagsList');
    if (!container) return;
    
    const assignedTags = this.allTags.filter(tag => 
      this.threadTags.includes(tag.id) || this.modalChanges.added.has(tag.id)
    ).filter(tag => !this.modalChanges.removed.has(tag.id));
    
    if (assignedTags.length === 0) {
      container.innerHTML = '<div class="empty-tags">No tags assigned</div>';
      return;
    }
    
    container.innerHTML = assignedTags.map(tag => `
      <div class="tag-chip assigned" style="background-color: ${tag.color}">
        ${this.escapeHtml(tag.name)}
        <button class="remove-tag" data-tag-id="${tag.id}" title="Remove tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    `).join('');
    
    // Add remove handlers
    container.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tagId = btn.dataset.tagId;
        this.removeTagFromThread(tagId);
      });
    });
  }

  renderAvailableTags() {
    const container = document.getElementById('availableTagsList');
    if (!container) return;
    
    const availableTags = this.allTags.filter(tag => 
      !this.threadTags.includes(tag.id) && 
      !this.modalChanges.added.has(tag.id) &&
      !this.modalChanges.removed.has(tag.id)
    );
    
    if (availableTags.length === 0) {
      container.innerHTML = '<div class="empty-tags">No available tags</div>';
      return;
    }
    
    container.innerHTML = availableTags.map(tag => `
      <div class="tag-chip available" style="background-color: ${tag.color}" data-tag-id="${tag.id}">
        ${this.escapeHtml(tag.name)}
      </div>
    `).join('');
    
    // Add click handlers
    container.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tagId = chip.dataset.tagId;
        this.addTagToThread(tagId);
      });
    });
  }

  addTagToThread(tagId) {
    this.modalChanges.added.add(tagId);
    this.modalChanges.removed.delete(tagId);
    this.renderTagLists();
  }

  removeTagFromThread(tagId) {
    this.modalChanges.removed.add(tagId);
    this.modalChanges.added.delete(tagId);
    this.renderTagLists();
  }

  showTagModal() {
    const modal = document.getElementById('tagModal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      // Setup modal event listeners if not already done
      if (!this.modalListenersSetup) {
        this.setupTagModalListeners();
        this.modalListenersSetup = true;
      }
    }
  }

  hideTagModal() {
    const modal = document.getElementById('tagModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      this.currentThread = null;
      this.modalChanges = { added: new Set(), removed: new Set() };
    }
  }

  setupTagModalListeners() {
    // Close modal handlers
    document.getElementById('closeTagModal')?.addEventListener('click', () => {
      this.hideTagModal();
    });
    
    document.getElementById('cancelTagsBtn')?.addEventListener('click', () => {
      this.hideTagModal();
    });
    
    // Click outside to close
    document.getElementById('tagModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'tagModal') {
        this.hideTagModal();
      }
    });
    
    // Save changes
    document.getElementById('saveTagsBtn')?.addEventListener('click', () => {
      this.saveTagChanges();
    });
    
    // Create new tag
    document.getElementById('createTagBtn')?.addEventListener('click', () => {
      this.createNewTag();
    });
    
    // Enter to create tag
    document.getElementById('newTagName')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.createNewTag();
      }
    });
  }

  async createNewTag() {
    const nameInput = document.getElementById('newTagName');
    const colorInput = document.getElementById('newTagColor');
    
    if (!nameInput || !colorInput) return;
    
    const name = nameInput.value.trim();
    const color = colorInput.value;
    
    if (!name) {
      this.showError('Please enter a tag name');
      return;
    }
    
    // Check if tag already exists
    if (this.allTags.some(tag => tag.name.toLowerCase() === name.toLowerCase())) {
      this.showError('A tag with this name already exists');
      return;
    }
    
    try {
      const newTag = await window.ThreadKeeperStorage.createTag(name, color);
      this.allTags.push(newTag);
      
      // Clear inputs
      nameInput.value = '';
      colorInput.value = '#1D9BF0';
      
      // Add to current thread
      this.addTagToThread(newTag.id);
      
      this.showNotification('Tag created successfully');
    } catch (error) {
      console.error('Failed to create tag:', error);
      this.showError('Failed to create tag');
    }
  }

  async saveTagChanges() {
    try {
      // Apply changes
      for (const tagId of this.modalChanges.added) {
        await window.ThreadKeeperStorage.addTagToThread(this.currentThread.id, tagId);
      }
      
      for (const tagId of this.modalChanges.removed) {
        await window.ThreadKeeperStorage.removeTagFromThread(this.currentThread.id, tagId);
      }
      
      // Reload threads to update UI
      await this.loadThreads();
      this.applyFilters();
      
      this.hideTagModal();
      this.showNotification('Tags updated successfully');
      
    } catch (error) {
      console.error('Failed to save tag changes:', error);
      this.showError('Failed to save changes');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async renderThreadTags(item, thread) {
    const tagsContainer = item.querySelector('.thread-tags');
    if (!tagsContainer) return;
    
    if (!thread.tags || thread.tags.length === 0) {
      tagsContainer.innerHTML = '';
      return;
    }
    
    try {
      const allTags = await window.ThreadKeeperStorage.getTags();
      const threadTags = thread.tags.map(tagId => allTags[tagId]).filter(Boolean);
      
      tagsContainer.innerHTML = threadTags.map(tag => `
        <span class="thread-tag" style="background-color: ${tag.color}">
          ${this.escapeHtml(tag.name)}
        </span>
      `).join('');
    } catch (error) {
      console.error('Failed to render thread tags:', error);
    }
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