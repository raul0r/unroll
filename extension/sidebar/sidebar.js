// sidebar.js - ThreadKeeper Sidebar Logic

class SidebarManager {
    constructor() {
      this.threads = {};
      this.filteredThreads = [];
      this.currentFilter = 'all';
      this.searchQuery = '';
      this.currentThreadId = null;
      
      this.elements = {
        threadListView: document.getElementById('threadListView'),
        threadDetailView: document.getElementById('threadDetailView'),
        threadList: document.getElementById('threadList'),
        threadItems: document.getElementById('threadItems'),
        loadingState: document.getElementById('loadingState'),
        emptyState: document.getElementById('emptyState'),
        searchInput: document.getElementById('searchInput'),
        clearSearchBtn: document.getElementById('clearSearchBtn'),
        threadCount: document.getElementById('threadCount'),
        tweetCount: document.getElementById('tweetCount'),
        backBtn: document.getElementById('backBtn'),
        exportBtn: document.getElementById('exportBtn'),
        
        // Detail view elements
        authorAvatar: document.getElementById('authorAvatar'),
        authorName: document.getElementById('authorName'),
        authorUsername: document.getElementById('authorUsername'),
        threadDate: document.getElementById('threadDate'),
        threadStats: document.getElementById('threadStats'),
        threadContent: document.getElementById('threadContent')
      };
      
      this.init();
    }
  
    async init() {
      try {
        // Initialize storage
        await window.ThreadKeeperStorage.initialize();
        
        // Load threads
        await this.loadThreads();
        
        // Update stats
        this.updateStats();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Apply filters
        this.applyFilters();
        
        // Check if we should show a specific thread (from URL fragment)
        this.checkForSpecificThread();
        
      } catch (error) {
        console.error('Failed to initialize sidebar:', error);
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
  
    updateStats() {
      const threadCount = Object.keys(this.threads).length;
      const tweetCount = Object.values(this.threads).reduce((sum, thread) => {
        return sum + (thread.tweets ? thread.tweets.length : 0);
      }, 0);
      
      this.elements.threadCount.textContent = threadCount;
      this.elements.tweetCount.textContent = tweetCount;
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
      
      // Back button
      this.elements.backBtn.addEventListener('click', () => {
        this.showThreadList();
      });
      
      // Export button
      this.elements.exportBtn.addEventListener('click', () => {
        if (this.currentThreadId) {
          this.exportThread(this.threads[this.currentThreadId]);
        }
      });
      
      // Listen for storage changes
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.threads) {
          this.handleStorageChange();
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
      const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
      
      switch (this.currentFilter) {
        case 'recent':
          filtered = filtered.filter(thread => thread.savedAt > weekAgo);
          break;
        case 'collections':
          filtered = filtered.filter(thread => thread.collectionId && thread.collectionId !== 'default');
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
      avatar.src = thread.authorAvatar || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNFNUU3RUIiLz4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyMCIgcj0iOCIgZmlsbD0iIzlDQTNBRiIvPgo8cGF0aCBkPSJNOCAzNmMwLTggOC0xNiAxNi0xNnMxNiA4IDE2IDE2IiBmaWxsPSIjOUNBM0FGIi8+Cjwvc3ZnPgo=';
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
      
      const tweetCount = thread.tweets ? thread.tweets.length : 0;
      item.querySelector('.tweet-count').textContent = tweetCount;
      
      // Set preview text
      const preview = thread.tweets && thread.tweets[0] ? thread.tweets[0].text : '';
      item.querySelector('.thread-preview').textContent = preview;
      
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
      
      // Delete button
      item.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteThread(thread);
      });
    }
  
    viewThread(thread) {
      this.currentThreadId = thread.id;
      
      // Hide thread list, show detail view
      this.elements.threadListView.style.display = 'none';
      this.elements.threadDetailView.style.display = 'block';
      this.elements.backBtn.style.display = 'flex';
      this.elements.exportBtn.style.display = 'flex';
      
      // Populate thread details
      this.renderThreadDetail(thread);
      
      // Update URL
      window.location.hash = `#thread/${thread.id}`;
    }
  
    renderThreadDetail(thread) {
      // Set author info
      this.elements.authorAvatar.src = thread.authorAvatar || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiNFNUU3RUIiLz4KPGNpcmNsZSBjeD0iMzIiIGN5PSIyNiIgcj0iMTAiIGZpbGw9IiM5Q0EzQUYiLz4KPHBhdGggZD0iTTEwIDQ4YzAtMTIgMTItMjAgMjItMjBzMjIgOCAyMiAyMCIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K';
      this.elements.authorName.textContent = thread.authorName;
      this.elements.authorUsername.textContent = `@${thread.authorUsername}`;
      
      // Set metadata
      const savedDate = new Date(thread.savedAt);
      this.elements.threadDate.textContent = `Saved on ${savedDate.toLocaleDateString()}`;
      
      const tweetCount = thread.tweets ? thread.tweets.length : 0;
      const likes = thread.likes || 0;
      const retweets = thread.retweets || 0;
      this.elements.threadStats.textContent = `${tweetCount} tweets • ${likes} likes • ${retweets} retweets`;
      
      // Render tweets
      this.renderTweets(thread.tweets || []);
    }
  
    renderTweets(tweets) {
      this.elements.threadContent.innerHTML = '';
      
      tweets.forEach((tweet, index) => {
        const tweetElement = this.createTweetElement(tweet, index + 1, tweets.length);
        this.elements.threadContent.appendChild(tweetElement);
      });
    }
  
    createTweetElement(tweet, index, total) {
      const template = document.getElementById('tweetTemplate');
      const clone = template.content.cloneNode(true);
      const tweetEl = clone.querySelector('.tweet');
      
      // Set tweet text
      const tweetText = tweetEl.querySelector('.tweet-text');
      tweetText.textContent = tweet.text;
      
      // Add thread numbering for multi-tweet threads
      if (total > 1) {
        const counter = document.createElement('span');
        counter.style.color = 'var(--text-tertiary)';
        counter.style.fontSize = '14px';
        counter.style.fontWeight = '600';
        counter.textContent = `${index}/${total}`;
        tweetText.insertBefore(counter, tweetText.firstChild);
        tweetText.insertBefore(document.createElement('br'), tweetText.children[1]);
      }
      
      // Handle media
      const mediaContainer = tweetEl.querySelector('.tweet-media');
      if (tweet.media && tweet.media.length > 0) {
        tweet.media.forEach(media => {
          if (media.type === 'image') {
            const img = document.createElement('img');
            img.src = media.url;
            img.alt = media.alt || '';
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
            img.style.marginBottom = '8px';
            mediaContainer.appendChild(img);
          }
        });
      }
      
      // Set timestamp
      const timestamp = tweetEl.querySelector('.tweet-timestamp');
      if (tweet.timestamp) {
        const date = new Date(tweet.timestamp);
        timestamp.textContent = date.toLocaleString();
      } else {
        timestamp.textContent = '';
      }
      
      return tweetEl;
    }
  
    showThreadList() {
      this.currentThreadId = null;
      
      // Show thread list, hide detail view
      this.elements.threadListView.style.display = 'block';
      this.elements.threadDetailView.style.display = 'none';
      this.elements.backBtn.style.display = 'none';
      this.elements.exportBtn.style.display = 'none';
      
      // Clear URL hash
      window.location.hash = '';
    }
  
    async exportThread(thread) {
      try {
        // Show export options
        const format = await this.showExportOptions();
        if (!format) return; // User cancelled
        
        const content = await this.generateExportContent(thread, format);
        
        const blob = new Blob([content], { 
          type: this.getMimeType(format)
        });
        const url = URL.createObjectURL(blob);
        
        const filename = `thread_${thread.authorUsername}_${Date.now()}.${this.getFileExtension(format)}`;
        
        // Try Chrome downloads API first (for extension popup), then fallback to direct download
        if (typeof chrome !== 'undefined' && chrome.downloads) {
          try {
            await new Promise((resolve, reject) => {
              chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true
              }, (downloadId) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(downloadId);
                }
              });
            });
          } catch (chromeError) {
            console.log('Chrome downloads API failed, using direct download:', chromeError);
            this.directDownload(url, filename);
          }
        } else {
          // Direct download for sidebar view
          this.directDownload(url, filename);
        }
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        this.showNotification(`Thread exported as ${format.toUpperCase()}`);
        
      } catch (error) {
        console.error('Failed to export thread:', error);
        this.showError('Failed to export thread');
      }
    }
  
    directDownload(url, filename) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  
    getMimeType(format) {
      switch (format) {
        case 'markdown': return 'text/markdown';
        case 'json': return 'application/json';
        case 'html': return 'text/html';
        default: return 'text/plain';
      }
    }
  
    getFileExtension(format) {
      switch (format) {
        case 'markdown': return 'md';
        case 'json': return 'json';
        case 'html': return 'html';
        default: return 'txt';
      }
    }
  
    async showExportOptions() {
      return new Promise((resolve) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        `;
  
        // Create modal
        const modal = document.createElement('div');
        modal.style.cssText = `
          background: var(--bg-primary);
          border-radius: 12px;
          padding: 24px;
          max-width: 300px;
          width: 90%;
          box-shadow: var(--shadow-md);
        `;
  
        modal.innerHTML = `
          <h3 style="margin-bottom: 16px; font-size: 18px; color: var(--text-primary);">Export Format</h3>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
            <button class="export-option" data-format="markdown" style="padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; text-align: left;">
              <strong>Markdown (.md)</strong><br>
              <small style="color: var(--text-secondary);">Formatted text with headers and links</small>
            </button>
            <button class="export-option" data-format="text" style="padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; text-align: left;">
              <strong>Plain Text (.txt)</strong><br>
              <small style="color: var(--text-secondary);">Simple text format</small>
            </button>
            <button class="export-option" data-format="json" style="padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; text-align: left;">
              <strong>JSON (.json)</strong><br>
              <small style="color: var(--text-secondary);">Raw data format</small>
            </button>
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button id="exportCancel" style="padding: 8px 16px; border: 1px solid var(--border-color); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer;">Cancel</button>
          </div>
        `;
  
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
  
        // Handle option selection
        modal.querySelectorAll('.export-option').forEach(button => {
          button.addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(button.dataset.format);
          });
          
          button.addEventListener('mouseenter', () => {
            button.style.background = 'var(--bg-hover)';
            button.style.borderColor = 'var(--primary-color)';
          });
          
          button.addEventListener('mouseleave', () => {
            button.style.background = 'var(--bg-secondary)';
            button.style.borderColor = 'var(--border-color)';
          });
        });
  
        // Handle cancel
        modal.querySelector('#exportCancel').addEventListener('click', () => {
          document.body.removeChild(overlay);
          resolve(null);
        });
  
        // Handle click outside modal
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            document.body.removeChild(overlay);
            resolve(null);
          }
        });
      });
    }
  
    async generateExportContent(thread, format) {
      if (format === 'markdown') {
        let content = `# Thread by @${thread.authorUsername}\n\n`;
        content += `**Author:** ${thread.authorName}\n`;
        content += `**Date Saved:** ${new Date(thread.savedAt).toLocaleString()}\n`;
        content += `**Original URL:** [View on Twitter](${thread.url})\n\n`;
        content += `---\n\n`;
        
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
        
        return content;
      } else if (format === 'json') {
        // Return the raw thread data as formatted JSON
        return JSON.stringify(thread, null, 2);
      } else {
        // Plain text format
        let content = `Thread by @${thread.authorUsername} (${thread.authorName})\n`;
        content += `Saved on: ${new Date(thread.savedAt).toLocaleString()}\n`;
        content += `URL: ${thread.url}\n`;
        content += `${'='.repeat(50)}\n\n`;
        
        thread.tweets.forEach((tweet, index) => {
          content += `[${index + 1}/${thread.tweets.length}]\n`;
          content += `${tweet.text}\n`;
          if (tweet.timestamp) {
            content += `(${new Date(tweet.timestamp).toLocaleString()})\n`;
          }
          content += '\n';
        });
        
        return content;
      }
    }
  
    async deleteThread(thread) {
      if (confirm(`Delete thread by @${thread.authorUsername}?`)) {
        try {
          await window.ThreadKeeperStorage.deleteThread(thread.id);
          
          // Remove from local state
          delete this.threads[thread.id];
          
          // If we're viewing this thread, go back to list
          if (this.currentThreadId === thread.id) {
            this.showThreadList();
          }
          
          // Refresh display
          this.updateStats();
          this.applyFilters();
          
          this.showNotification('Thread deleted');
          
        } catch (error) {
          console.error('Failed to delete thread:', error);
          this.showError('Failed to delete thread');
        }
      }
    }
  
    checkForSpecificThread() {
      const hash = window.location.hash;
      if (hash.startsWith('#thread/')) {
        const threadId = hash.substring(8);
        const thread = this.threads[threadId];
        if (thread) {
          this.viewThread(thread);
        }
      }
    }
  
    async handleStorageChange() {
      await this.loadThreads();
      this.updateStats();
      this.applyFilters();
    }
  
    formatDate(date) {
      const now = new Date();
      const diff = now - date;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 7) {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
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
      // Simple notification - could be enhanced with a proper notification system
      console.log('Notification:', message);
      
      // Show as a temporary overlay
      const notification = document.createElement('div');
      notification.textContent = message;
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--success-color);
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
      `;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    }
  
    showError(message) {
      console.error('Error:', message);
      
      const notification = document.createElement('div');
      notification.textContent = message;
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--danger-color);
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
      `;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 5000);
    }
  }
  
  // Initialize sidebar when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    new SidebarManager();
  });
  
  // Handle browser back/forward
  window.addEventListener('hashchange', () => {
    if (window.sidebarManager) {
      window.sidebarManager.checkForSpecificThread();
    }
  });
  
  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);