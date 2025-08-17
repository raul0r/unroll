// lib/storage.js - Core storage management for ThreadKeeper

class StorageManager {
  constructor() {
    this.STORAGE_KEYS = {
      THREADS: 'threads',
      COLLECTIONS: 'collections',
      TAGS: 'tags',
      USER_PREFS: 'userPrefs',
      METADATA: 'metadata',
      AUTH: 'auth',
      SYNC_STATE: 'syncState'
    };
    
    this.MAX_FREE_THREADS = 50;
    this.STORAGE_VERSION = 1;
  }

  // Initialize storage with default values
  async initialize() {
    try {
      const metadata = await this.getMetadata();
      if (!metadata.version) {
        await this.setupInitialStorage();
      } else if (metadata.version < this.STORAGE_VERSION) {
        await this.migrateStorage(metadata.version);
      }
      return true;
    } catch (error) {
      console.error('Storage initialization failed:', error);
      return false;
    }
  }

  async setupInitialStorage() {
    const initialData = {
      [this.STORAGE_KEYS.THREADS]: {},
      [this.STORAGE_KEYS.COLLECTIONS]: {
        default: {
          id: 'default',
          name: 'Uncategorized',
          createdAt: Date.now(),
          threadIds: []
        }
      },
      [this.STORAGE_KEYS.TAGS]: {},
      [this.STORAGE_KEYS.USER_PREFS]: {
        theme: 'light',
        autoSave: false,
        notifications: true,
        defaultCollection: 'default'
      },
      [this.STORAGE_KEYS.METADATA]: {
        version: this.STORAGE_VERSION,
        installedAt: Date.now(),
        lastSync: null,
        threadCount: 0,
        storageUsed: 0
      }
    };

    await chrome.storage.local.set(initialData);
  }

  // Thread Management
  async saveThread(threadData) {
    try {
      const threads = await this.getThreads();
      const metadata = await this.getMetadata();
      const user = await this.getUser();
      
      // Check storage limits for free users
      if (!user?.isPremium && metadata.threadCount >= this.MAX_FREE_THREADS) {
        throw new Error('STORAGE_LIMIT_REACHED');
      }

      const threadId = this.generateThreadId(threadData);
      
      const thread = {
        id: threadId,
        url: threadData.url,
        authorUsername: threadData.authorUsername,
        authorName: threadData.authorName,
        authorAvatar: threadData.authorAvatar,
        tweets: threadData.tweets,
        savedAt: Date.now(),
        lastAccessed: Date.now(),
        tags: [],
        collectionId: 'default',
        metadata: {
          tweetCount: threadData.tweets.length,
          likes: threadData.likes || 0,
          retweets: threadData.retweets || 0,
          replies: threadData.replies || 0,
          hasMedia: threadData.tweets.some(t => t.media?.length > 0),
          language: threadData.language || 'en'
        }
      };

      threads[threadId] = thread;
      metadata.threadCount++;
      metadata.storageUsed = await this.calculateStorageUsed();

      await chrome.storage.local.set({
        [this.STORAGE_KEYS.THREADS]: threads,
        [this.STORAGE_KEYS.METADATA]: metadata
      });

      // Add to default collection
      await this.addThreadToCollection(threadId, 'default');

      return thread;
    } catch (error) {
      console.error('Failed to save thread:', error);
      throw error;
    }
  }

  async getThread(threadId) {
    const threads = await this.getThreads();
    return threads[threadId] || null;
  }

  async getThreads(filters = {}) {
    const data = await chrome.storage.local.get(this.STORAGE_KEYS.THREADS);
    const threads = data[this.STORAGE_KEYS.THREADS] || {};
    
    if (Object.keys(filters).length === 0) {
      return threads;
    }

    // Apply filters
    return Object.fromEntries(
      Object.entries(threads).filter(([id, thread]) => {
        if (filters.collectionId && thread.collectionId !== filters.collectionId) {
          return false;
        }
        if (filters.tags?.length && !filters.tags.some(tag => thread.tags.includes(tag))) {
          return false;
        }
        if (filters.author && !thread.authorUsername.toLowerCase().includes(filters.author.toLowerCase())) {
          return false;
        }
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          return thread.tweets.some(tweet => 
            tweet.text.toLowerCase().includes(searchLower)
          );
        }
        return true;
      })
    );
  }

  async deleteThread(threadId) {
    const threads = await this.getThreads();
    const metadata = await this.getMetadata();
    
    if (threads[threadId]) {
      // Remove from collection
      await this.removeThreadFromCollection(threadId, threads[threadId].collectionId);
      
      delete threads[threadId];
      metadata.threadCount--;
      metadata.storageUsed = await this.calculateStorageUsed();
      
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.THREADS]: threads,
        [this.STORAGE_KEYS.METADATA]: metadata
      });
      
      return true;
    }
    return false;
  }

  async updateThread(threadId, updates) {
    const threads = await this.getThreads();
    
    if (threads[threadId]) {
      threads[threadId] = {
        ...threads[threadId],
        ...updates,
        lastModified: Date.now()
      };
      
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.THREADS]: threads
      });
      
      return threads[threadId];
    }
    return null;
  }

  // Collections Management
  async getCollections() {
    const data = await chrome.storage.local.get(this.STORAGE_KEYS.COLLECTIONS);
    return data[this.STORAGE_KEYS.COLLECTIONS] || {};
  }

  async createCollection(name, description = '') {
    const collections = await this.getCollections();
    const collectionId = this.generateId('col');
    
    collections[collectionId] = {
      id: collectionId,
      name,
      description,
      createdAt: Date.now(),
      threadIds: [],
      parentId: null,
      color: this.generateColor()
    };
    
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.COLLECTIONS]: collections
    });
    
    return collections[collectionId];
  }

  async deleteCollection(collectionId) {
    if (collectionId === 'default') {
      throw new Error('Cannot delete default collection');
    }
    
    const collections = await this.getCollections();
    const threads = await this.getThreads();
    
    // Move threads to default collection
    const threadIds = collections[collectionId]?.threadIds || [];
    for (const threadId of threadIds) {
      if (threads[threadId]) {
        threads[threadId].collectionId = 'default';
        collections.default.threadIds.push(threadId);
      }
    }
    
    delete collections[collectionId];
    
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.COLLECTIONS]: collections,
      [this.STORAGE_KEYS.THREADS]: threads
    });
    
    return true;
  }

  async addThreadToCollection(threadId, collectionId) {
    const collections = await this.getCollections();
    const threads = await this.getThreads();
    
    if (!collections[collectionId] || !threads[threadId]) {
      return false;
    }
    
    // Remove from previous collection
    const oldCollectionId = threads[threadId].collectionId;
    if (oldCollectionId && collections[oldCollectionId]) {
      collections[oldCollectionId].threadIds = 
        collections[oldCollectionId].threadIds.filter(id => id !== threadId);
    }
    
    // Add to new collection
    if (!collections[collectionId].threadIds.includes(threadId)) {
      collections[collectionId].threadIds.push(threadId);
    }
    
    threads[threadId].collectionId = collectionId;
    
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.COLLECTIONS]: collections,
      [this.STORAGE_KEYS.THREADS]: threads
    });
    
    return true;
  }

  async removeThreadFromCollection(threadId, collectionId) {
    const collections = await this.getCollections();
    
    if (collections[collectionId]) {
      collections[collectionId].threadIds = 
        collections[collectionId].threadIds.filter(id => id !== threadId);
      
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.COLLECTIONS]: collections
      });
      
      return true;
    }
    return false;
  }

  // Tags Management
  async getTags() {
    const data = await chrome.storage.local.get(this.STORAGE_KEYS.TAGS);
    return data[this.STORAGE_KEYS.TAGS] || {};
  }

  async createTag(name, color = null) {
    const tags = await this.getTags();
    const tagId = this.generateId('tag');
    
    tags[tagId] = {
      id: tagId,
      name,
      color: color || this.generateColor(),
      createdAt: Date.now(),
      threadCount: 0
    };
    
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.TAGS]: tags
    });
    
    return tags[tagId];
  }

  async addTagToThread(threadId, tagId) {
    const threads = await this.getThreads();
    const tags = await this.getTags();
    
    if (threads[threadId] && tags[tagId]) {
      if (!threads[threadId].tags.includes(tagId)) {
        threads[threadId].tags.push(tagId);
        tags[tagId].threadCount++;
        
        await chrome.storage.local.set({
          [this.STORAGE_KEYS.THREADS]: threads,
          [this.STORAGE_KEYS.TAGS]: tags
        });
        
        return true;
      }
    }
    return false;
  }

  async removeTagFromThread(threadId, tagId) {
    const threads = await this.getThreads();
    const tags = await this.getTags();
    
    if (threads[threadId] && tags[tagId]) {
      threads[threadId].tags = threads[threadId].tags.filter(id => id !== tagId);
      tags[tagId].threadCount = Math.max(0, tags[tagId].threadCount - 1);
      
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.THREADS]: threads,
        [this.STORAGE_KEYS.TAGS]: tags
      });
      
      return true;
    }
    return false;
  }

  async deleteTag(tagId) {
    const tags = await this.getTags();
    const threads = await this.getThreads();
    
    if (!tags[tagId]) return false;
    
    // Remove tag from all threads
    for (const thread of Object.values(threads)) {
      if (thread.tags.includes(tagId)) {
        thread.tags = thread.tags.filter(id => id !== tagId);
      }
    }
    
    // Delete the tag
    delete tags[tagId];
    
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.THREADS]: threads,
      [this.STORAGE_KEYS.TAGS]: tags
    });
    
    return true;
  }

  async updateTag(tagId, updates) {
    const tags = await this.getTags();
    
    if (!tags[tagId]) return false;
    
    tags[tagId] = {
      ...tags[tagId],
      ...updates,
      updatedAt: Date.now()
    };
    
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.TAGS]: tags
    });
    
    return tags[tagId];
  }

  async getThreadTags(threadId) {
    const thread = await this.getThread(threadId);
    const tags = await this.getTags();
    
    if (!thread || !thread.tags) return [];
    
    return thread.tags.map(tagId => tags[tagId]).filter(Boolean);
  }

  async getTagsForThread(threadId) {
    return this.getThreadTags(threadId);
  }

  async searchTags(query) {
    const tags = await this.getTags();
    const queryLower = query.toLowerCase();
    
    return Object.values(tags).filter(tag => 
      tag.name.toLowerCase().includes(queryLower)
    );
  }

  // Search functionality
  async searchThreads(query, options = {}) {
    const threads = await this.getThreads();
    const results = [];
    const queryLower = query.toLowerCase();
    
    for (const [id, thread] of Object.entries(threads)) {
      let score = 0;
      const matches = [];
      
      // Search in tweet text
      thread.tweets.forEach((tweet, index) => {
        if (tweet.text.toLowerCase().includes(queryLower)) {
          score += 10;
          matches.push({ type: 'tweet', index, snippet: this.getSnippet(tweet.text, queryLower) });
        }
      });
      
      // Search in author
      if (thread.authorUsername.toLowerCase().includes(queryLower)) {
        score += 20;
        matches.push({ type: 'author', value: thread.authorUsername });
      }
      
      // Search in author name
      if (thread.authorName.toLowerCase().includes(queryLower)) {
        score += 15;
        matches.push({ type: 'authorName', value: thread.authorName });
      }
      
      if (score > 0) {
        results.push({
          thread,
          score,
          matches
        });
      }
    }
    
    // Sort by relevance score
    results.sort((a, b) => b.score - a.score);
    
    // Apply pagination if needed
    if (options.limit) {
      const start = options.offset || 0;
      return results.slice(start, start + options.limit);
    }
    
    return results;
  }

  // User and Auth Management
  async getUser() {
    const data = await chrome.storage.local.get(this.STORAGE_KEYS.AUTH);
    return data[this.STORAGE_KEYS.AUTH]?.user || null;
  }

  async setUser(userData) {
    const auth = await this.getAuth();
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.AUTH]: {
        ...auth,
        user: userData
      }
    });
  }

  async getAuth() {
    const data = await chrome.storage.local.get(this.STORAGE_KEYS.AUTH);
    return data[this.STORAGE_KEYS.AUTH] || {};
  }

  async setAuth(authData) {
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.AUTH]: authData
    });
  }

  async clearAuth() {
    await chrome.storage.local.remove(this.STORAGE_KEYS.AUTH);
  }

  // Metadata and Stats
  async getMetadata() {
    const data = await chrome.storage.local.get(this.STORAGE_KEYS.METADATA);
    return data[this.STORAGE_KEYS.METADATA] || {};
  }

  async updateMetadata(updates) {
    const metadata = await this.getMetadata();
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.METADATA]: {
        ...metadata,
        ...updates
      }
    });
  }

  async getStats() {
    const metadata = await this.getMetadata();
    const threads = await this.getThreads();
    const collections = await this.getCollections();
    const tags = await this.getTags();
    
    const threadArray = Object.values(threads);
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    return {
      totalThreads: metadata.threadCount || 0,
      totalTweets: threadArray.reduce((sum, t) => sum + t.tweets.length, 0),
      totalCollections: Object.keys(collections).length,
      totalTags: Object.keys(tags).length,
      storageUsed: metadata.storageUsed || 0,
      savedToday: threadArray.filter(t => t.savedAt > dayAgo).length,
      savedThisWeek: threadArray.filter(t => t.savedAt > weekAgo).length,
      savedThisMonth: threadArray.filter(t => t.savedAt > monthAgo).length,
      topAuthors: this.getTopAuthors(threadArray, 5),
      avgThreadLength: threadArray.length > 0 
        ? Math.round(threadArray.reduce((sum, t) => sum + t.tweets.length, 0) / threadArray.length)
        : 0
    };
  }

  // Export functionality
  async exportThread(threadId, format = 'text') {
    const thread = await this.getThread(threadId);
    if (!thread) return null;
    
    switch (format) {
      case 'text':
        return this.exportAsText(thread);
      case 'json':
        return JSON.stringify(thread, null, 2);
      case 'markdown':
        return this.exportAsMarkdown(thread);
      default:
        return null;
    }
  }

  exportAsText(thread) {
    let output = `Thread by @${thread.authorUsername} (${thread.authorName})\n`;
    output += `Saved on: ${new Date(thread.savedAt).toLocaleString()}\n`;
    output += `URL: ${thread.url}\n`;
    output += `${'='.repeat(50)}\n\n`;
    
    thread.tweets.forEach((tweet, index) => {
      output += `[${index + 1}/${thread.tweets.length}]\n`;
      output += `${tweet.text}\n`;
      if (tweet.timestamp) {
        output += `(${new Date(tweet.timestamp).toLocaleString()})\n`;
      }
      output += '\n';
    });
    
    return output;
  }

  exportAsMarkdown(thread) {
    let output = `# Thread by @${thread.authorUsername}\n\n`;
    output += `**Author:** ${thread.authorName}\n`;
    output += `**Date Saved:** ${new Date(thread.savedAt).toLocaleString()}\n`;
    output += `**Original URL:** [View on Twitter](${thread.url})\n\n`;
    output += `---\n\n`;
    
    thread.tweets.forEach((tweet, index) => {
      output += `## Tweet ${index + 1}/${thread.tweets.length}\n\n`;
      output += `${tweet.text}\n\n`;
      if (tweet.media?.length > 0) {
        output += `**Media:** ${tweet.media.length} attachment(s)\n\n`;
      }
      if (tweet.timestamp) {
        output += `*${new Date(tweet.timestamp).toLocaleString()}*\n\n`;
      }
    });
    
    return output;
  }

  // Utility functions
  generateThreadId(threadData) {
    const baseId = threadData.url.split('/').pop() || Date.now().toString();
    return `thread_${baseId}_${Date.now()}`;
  }

  generateId(prefix = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
  }

  generateColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#FFA07A', '#87CEEB', '#F0E68C'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  getSnippet(text, query, contextLength = 50) {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return text.slice(0, 100) + '...';
    
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + query.length + contextLength);
    
    let snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    
    return snippet;
  }

  getTopAuthors(threads, limit = 5) {
    const authorCounts = {};
    
    threads.forEach(thread => {
      const author = thread.authorUsername;
      authorCounts[author] = (authorCounts[author] || 0) + 1;
    });
    
    return Object.entries(authorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([author, count]) => ({ author, count }));
  }

  async calculateStorageUsed() {
    const data = await chrome.storage.local.get(null);
    const jsonString = JSON.stringify(data);
    return new Blob([jsonString]).size;
  }

  async migrateStorage(fromVersion) {
    // Handle storage migrations between versions
    console.log(`Migrating storage from version ${fromVersion} to ${this.STORAGE_VERSION}`);
    // Add migration logic here as needed
  }

  // Sync-related methods for premium users
  async getSyncState() {
    const data = await chrome.storage.local.get(this.STORAGE_KEYS.SYNC_STATE);
    return data[this.STORAGE_KEYS.SYNC_STATE] || {
      lastSync: null,
      pendingChanges: [],
      syncEnabled: false
    };
  }

  async updateSyncState(updates) {
    const syncState = await this.getSyncState();
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.SYNC_STATE]: {
        ...syncState,
        ...updates
      }
    });
  }

  async addPendingChange(change) {
    const syncState = await this.getSyncState();
    syncState.pendingChanges.push({
      ...change,
      timestamp: Date.now()
    });
    await this.updateSyncState(syncState);
  }
}

// Create and export singleton instance
const storageManager = new StorageManager();

// Make it available globally for the extension
if (typeof window !== 'undefined') {
  window.ThreadKeeperStorage = storageManager;
}