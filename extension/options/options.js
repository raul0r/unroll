// options.js - ThreadKeeper Options Page Logic

class OptionsManager {
    constructor() {
      this.settings = {
        autoSave: false,
        notifications: true,
        defaultExportFormat: 'markdown'
      };
      
      this.init();
    }
  
    async init() {
      await this.loadSettings();
      await this.loadStats();
      this.setupEventListeners();
      this.updateUI();
    }
  
    async loadSettings() {
      try {
        const data = await chrome.storage.local.get('userPrefs');
        if (data.userPrefs) {
          this.settings = { ...this.settings, ...data.userPrefs };
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
  
    async saveSettings() {
      try {
        await chrome.storage.local.set({ userPrefs: this.settings });
        this.showSaveStatus();
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    }
  
    async loadStats() {
      try {
        // Get threads data
        const threadsData = await chrome.storage.local.get('threads');
        const threads = threadsData.threads || {};
        
        // Get metadata
        const metadataData = await chrome.storage.local.get('metadata');
        const metadata = metadataData.metadata || {};
        
        // Calculate stats
        const threadCount = Object.keys(threads).length;
        const tweetCount = Object.values(threads).reduce((sum, thread) => {
          return sum + (thread.tweets ? thread.tweets.length : 0);
        }, 0);
        
        // Calculate storage size
        const allData = await chrome.storage.local.get(null);
        const storageSize = new Blob([JSON.stringify(allData)]).size;
        
        // Update UI
        document.getElementById('totalThreads').textContent = threadCount;
        document.getElementById('totalTweets').textContent = tweetCount;
        document.getElementById('storageSize').textContent = this.formatBytes(storageSize);
        
      } catch (error) {
        console.error('Failed to load stats:', error);
      }
    }
  
    setupEventListeners() {
      // Auto-save setting
      const autoSaveCheckbox = document.getElementById('autoSave');
      autoSaveCheckbox.addEventListener('change', (e) => {
        this.settings.autoSave = e.target.checked;
        this.saveSettings();
      });
  
      // Notifications setting
      const notificationsCheckbox = document.getElementById('notifications');
      notificationsCheckbox.addEventListener('change', (e) => {
        this.settings.notifications = e.target.checked;
        this.saveSettings();
      });
  
      // Default export format
      const exportFormatSelect = document.getElementById('defaultExportFormat');
      exportFormatSelect.addEventListener('change', (e) => {
        this.settings.defaultExportFormat = e.target.value;
        this.saveSettings();
      });
  
      // Export all data button
      document.getElementById('exportAllData').addEventListener('click', () => {
        this.exportAllData();
      });
  
      // Clear all data button
      document.getElementById('clearAllData').addEventListener('click', () => {
        this.clearAllData();
      });
  
      // Set extension version
      if (chrome.runtime && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        document.getElementById('extensionVersion').textContent = manifest.version;
      }
    }
  
    updateUI() {
      // Update checkboxes
      document.getElementById('autoSave').checked = this.settings.autoSave;
      document.getElementById('notifications').checked = this.settings.notifications;
      
      // Update select
      document.getElementById('defaultExportFormat').value = this.settings.defaultExportFormat;
    }
  
    async exportAllData() {
      try {
        // Get all extension data
        const allData = await chrome.storage.local.get(null);
        
        // Create export object
        const exportData = {
          exportedAt: new Date().toISOString(),
          version: chrome.runtime.getManifest().version,
          data: allData
        };
        
        // Create and download file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const filename = `threadkeeper_backup_${Date.now()}.json`;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        this.showNotification('All data exported successfully!', 'success');
        
      } catch (error) {
        console.error('Failed to export data:', error);
        this.showNotification('Failed to export data', 'error');
      }
    }
  
    async clearAllData() {
      const confirmed = confirm(
        'Are you sure you want to delete ALL saved threads and data? This action cannot be undone.'
      );
      
      if (!confirmed) return;
      
      const doubleConfirmed = confirm(
        'This will permanently delete all your saved threads, settings, and data. Are you absolutely sure?'
      );
      
      if (!doubleConfirmed) return;
      
      try {
        // Clear all storage except user preferences
        await chrome.storage.local.clear();
        
        // Restore user preferences
        await chrome.storage.local.set({ userPrefs: this.settings });
        
        // Reload stats
        await this.loadStats();
        
        this.showNotification('All data cleared successfully', 'success');
        
      } catch (error) {
        console.error('Failed to clear data:', error);
        this.showNotification('Failed to clear data', 'error');
      }
    }
  
    showSaveStatus() {
      const status = document.getElementById('saveStatus');
      status.style.display = 'block';
      status.classList.add('show');
      
      setTimeout(() => {
        status.style.display = 'none';
        status.classList.remove('show');
      }, 2000);
    }
  
    showNotification(message, type = 'success') {
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      notification.textContent = message;
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: 500;
        z-index: 1001;
        animation: slideIn 0.3s ease;
        background: ${type === 'success' ? 'var(--success-color)' : 'var(--danger-color)'};
      `;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    }
  
    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
  }
  
  // Initialize options page when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    new OptionsManager();
  });
  
  // Add slideOut animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);