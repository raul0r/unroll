// content/button-injector.js - Injects ThreadKeeper save button into Twitter/X

class ButtonInjector {
  constructor() {
    this.buttonsInjected = new Set();
    this.observer = null;
    this.isInitialized = false;
    
    this.BUTTON_HTML = `
      <div class="threadkeeper-save-button" data-threadkeeper-injected="true">
        <button class="tk-save-btn" title="Save thread with ThreadKeeper">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="tk-save-text">Save</span>
        </button>
        <div class="tk-save-status" style="display: none;">
          <span class="tk-status-text"></span>
        </div>
      </div>
    `;
  }

  initialize() {
    if (this.isInitialized) return;
    
    this.injectStyles();
    this.setupObserver();
    this.injectButtons();
    this.setupEventListeners();
    this.isInitialized = true;
    
    console.log('ThreadKeeper: Button injector initialized');
  }

  injectStyles() {
    // Check if styles already injected
    if (document.getElementById('threadkeeper-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'threadkeeper-styles';
    styles.textContent = `
      .threadkeeper-save-button {
        display: inline-flex;
        align-items: center;
        margin-left: 8px;
      }

      .tk-save-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        background: transparent;
        border: 1px solid rgb(207, 217, 222);
        border-radius: 9999px;
        color: rgb(83, 100, 113);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }

      .tk-save-btn:hover {
        background-color: rgba(29, 155, 240, 0.1);
        border-color: rgba(29, 155, 240, 0.5);
        color: rgb(29, 155, 240);
      }

      .tk-save-btn:active {
        transform: scale(0.95);
      }

      .tk-save-btn.saving {
        background-color: rgba(29, 155, 240, 0.1);
        border-color: rgb(29, 155, 240);
        color: rgb(29, 155, 240);
        pointer-events: none;
      }

      .tk-save-btn.saved {
        background-color: rgba(0, 186, 124, 0.1);
        border-color: rgb(0, 186, 124);
        color: rgb(0, 186, 124);
      }

      .tk-save-btn.error {
        background-color: rgba(244, 33, 46, 0.1);
        border-color: rgb(244, 33, 46);
        color: rgb(244, 33, 46);
      }

      .tk-save-btn svg {
        width: 16px;
        height: 16px;
      }

      .tk-save-text {
        display: none;
      }

      @media (min-width: 500px) {
        .tk-save-text {
          display: inline;
        }
      }

      .tk-save-status {
        position: absolute;
        top: -25px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 10000;
        pointer-events: none;
      }

      .tk-save-status.show {
        display: block !important;
        animation: fadeInOut 2s ease;
      }

      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(-5px); }
        20% { opacity: 1; transform: translateX(-50%) translateY(0); }
        80% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-5px); }
      }

      /* Pulse animation for new threads */
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(29, 155, 240, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(29, 155, 240, 0); }
        100% { box-shadow: 0 0 0 0 rgba(29, 155, 240, 0); }
      }

      .tk-save-btn.pulse {
        animation: pulse 2s;
      }

      /* Dark mode support */
      [data-theme="dark"] .tk-save-btn {
        border-color: rgb(83, 100, 113);
        color: rgb(139, 152, 165);
      }

      [data-theme="dark"] .tk-save-btn:hover {
        background-color: rgba(29, 155, 240, 0.2);
        border-color: rgba(29, 155, 240, 0.7);
        color: rgb(29, 155, 240);
      }
    `;
    
    document.head.appendChild(styles);
  }

  setupObserver() {
    // Disconnect existing observer if any
    if (this.observer) {
      this.observer.disconnect();
    }

    // Create mutation observer to watch for new tweets
    this.observer = new MutationObserver((mutations) => {
      // Debounce to avoid too many injections
      clearTimeout(this.injectTimeout);
      this.injectTimeout = setTimeout(() => {
        this.injectButtons();
      }, 500);
    });

    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
  }

  injectButtons() {
    // Find all tweet action bars that don't have our button yet
    const actionBars = document.querySelectorAll('[role="group"]:not([data-threadkeeper-processed])');
    
    actionBars.forEach(actionBar => {
      // Check if this is a tweet action bar (has reply, retweet, like buttons)
      if (this.isTweetActionBar(actionBar)) {
        this.injectButton(actionBar);
      }
    });

    // Also inject on thread pages
    if (this.isThreadPage()) {
      this.injectThreadButton();
    }
  }

  isTweetActionBar(element) {
    // Check for presence of typical Twitter action buttons
    const hasReply = element.querySelector('[data-testid="reply"]');
    const hasRetweet = element.querySelector('[data-testid="retweet"]');
    const hasLike = element.querySelector('[data-testid="like"]');
    
    return hasReply || hasRetweet || hasLike;
  }

  injectButton(actionBar) {
    // Mark as processed
    actionBar.setAttribute('data-threadkeeper-processed', 'true');
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.innerHTML = this.BUTTON_HTML;
    const button = buttonContainer.firstElementChild;
    
    // Find tweet element
    const tweetElement = this.findParentTweet(actionBar);
    if (!tweetElement) return;
    
    // Get tweet ID or generate unique ID
    const tweetId = this.getTweetId(tweetElement);
    button.setAttribute('data-tweet-id', tweetId);
    
    // Check if this tweet is already saved
    this.checkIfSaved(tweetId).then(isSaved => {
      if (isSaved) {
        button.querySelector('.tk-save-btn').classList.add('saved');
        button.querySelector('.tk-save-text').textContent = 'Saved';
      }
    });
    
    // Insert button into action bar
    const shareButton = actionBar.querySelector('[data-testid="share"]') || 
                       actionBar.querySelector('[aria-label*="Share"]');
    
    if (shareButton && shareButton.parentElement) {
      // Insert before share button
      shareButton.parentElement.parentElement.insertBefore(
        button, 
        shareButton.parentElement
      );
    } else {
      // Append to end of action bar
      actionBar.appendChild(button);
    }
    
    // Add click handler
    this.addClickHandler(button, tweetElement);
  }

  injectThreadButton() {
    // Check if we're on a thread page and inject a prominent save button
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryColumn || document.querySelector('.tk-thread-save-button')) return;
    
    const threadButton = document.createElement('div');
    threadButton.className = 'tk-thread-save-button';
    threadButton.innerHTML = `
      <button class="tk-save-thread-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Save Entire Thread
      </button>
    `;
    
    // Style the thread button
    const style = document.createElement('style');
    style.textContent = `
      .tk-thread-save-button {
        position: sticky;
        top: 70px;
        z-index: 100;
        padding: 12px;
        background: white;
        border-bottom: 1px solid rgb(239, 243, 244);
      }
      
      [data-theme="dark"] .tk-thread-save-button {
        background: black;
        border-bottom-color: rgb(47, 51, 54);
      }
      
      .tk-save-thread-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 24px;
        background: rgb(29, 155, 240);
        color: white;
        border: none;
        border-radius: 9999px;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      
      .tk-save-thread-btn:hover {
        background: rgb(26, 140, 216);
      }
      
      .tk-save-thread-btn:active {
        transform: scale(0.98);
      }
    `;
    
    document.head.appendChild(style);
    
    // Insert at top of primary column
    const header = primaryColumn.querySelector('[role="heading"]')?.parentElement;
    if (header) {
      header.insertAdjacentElement('afterend', threadButton);
    } else {
      primaryColumn.insertBefore(threadButton, primaryColumn.firstChild);
    }
    
    // Add click handler for thread button
    threadButton.querySelector('button').addEventListener('click', () => {
      this.saveFullThread();
    });
  }

  findParentTweet(element) {
    // Traverse up to find the tweet container
    let current = element;
    while (current && current !== document.body) {
      if (current.getAttribute('data-testid') === 'tweet' || 
          current.querySelector('[data-testid="tweet"]')) {
        return current.getAttribute('data-testid') === 'tweet' ? 
               current : current.querySelector('[data-testid="tweet"]');
      }
      current = current.parentElement;
    }
    return null;
  }

  getTweetId(tweetElement) {
    // Try to extract tweet ID from links
    const links = tweetElement.querySelectorAll('a[href*="/status/"]');
    for (const link of links) {
      const match = link.href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    
    // Fallback to generating a unique ID
    return `tweet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async checkIfSaved(tweetId) {
    try {
      const threads = await window.ThreadKeeperStorage.getThreads();
      return Object.values(threads).some(thread => 
        thread.tweets.some(tweet => tweet.id === tweetId) ||
        thread.url.includes(tweetId)
      );
    } catch (error) {
      return false;
    }
  }

  addClickHandler(buttonElement, tweetElement) {
    const button = buttonElement.querySelector('.tk-save-btn');
    const statusDiv = buttonElement.querySelector('.tk-save-status');
    const statusText = statusDiv.querySelector('.tk-status-text');
    
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Check if already saving
      if (button.classList.contains('saving')) return;
      
      // Update UI to saving state
      button.classList.add('saving');
      button.querySelector('.tk-save-text').textContent = 'Saving...';
      
      try {
        // Parse and save the thread
        const threadData = await this.parseThreadFromTweet(tweetElement);
        const saved = await window.ThreadKeeperStorage.saveThread(threadData);
        
        // Update UI to saved state
        button.classList.remove('saving');
        button.classList.add('saved', 'pulse');
        button.querySelector('.tk-save-text').textContent = 'Saved';
        
        // Show success status
        statusText.textContent = `Saved ${threadData.tweets.length} tweets`;
        statusDiv.classList.add('show');
        
        // Send message to background script
        chrome.runtime.sendMessage({
          type: 'THREAD_SAVED',
          data: saved
        });
        
        // Remove pulse after animation
        setTimeout(() => {
          button.classList.remove('pulse');
          statusDiv.classList.remove('show');
        }, 2000);
        
      } catch (error) {
        console.error('Failed to save thread:', error);
        
        // Update UI to error state
        button.classList.remove('saving');
        button.classList.add('error');
        button.querySelector('.tk-save-text').textContent = 'Error';
        
        // Show error status
        if (error.message === 'STORAGE_LIMIT_REACHED') {
          statusText.textContent = 'Storage limit reached. Upgrade to Pro!';
        } else {
          statusText.textContent = 'Failed to save thread';
        }
        statusDiv.classList.add('show');
        
        // Reset after delay
        setTimeout(() => {
          button.classList.remove('error');
          button.querySelector('.tk-save-text').textContent = 'Save';
          statusDiv.classList.remove('show');
        }, 3000);
      }
    });
  }

  async parseThreadFromTweet(tweetElement) {
    // Check if this is part of a thread
    const isThread = this.isPartOfThread(tweetElement);
    
    if (isThread) {
      // Parse the entire thread
      return await window.ThreadKeeperParser.parseThread();
    } else {
      // Just save this single tweet
      const tweetData = window.ThreadKeeperParser.extractTweetData(tweetElement);
      const authorInfo = window.ThreadKeeperParser.extractAuthorInfo(tweetElement);
      
      return {
        ...authorInfo,
        tweets: [tweetData],
        url: window.location.href,
        threadLength: 1
      };
    }
  }

  isPartOfThread(tweetElement) {
    // Check if we're on a thread page
    if (this.isThreadPage()) return true;
    
    // Check for thread indicators
    const hasThreadLine = tweetElement.querySelector('[data-testid="tweet-thread-line"]');
    const showThreadText = Array.from(tweetElement.querySelectorAll('span')).some(
      span => span.textContent.includes('Show this thread')
    );
    
    return hasThreadLine || showThreadText;
  }

  async saveFullThread() {
    const button = document.querySelector('.tk-save-thread-btn');
    if (!button) return;
    
    const originalText = button.innerHTML;
    button.innerHTML = `
      <svg class="tk-spinner" width="20" height="20" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="32" stroke-dashoffset="32">
          <animate attributeName="stroke-dashoffset" dur="1s" values="32;0" repeatCount="indefinite"/>
        </circle>
      </svg>
      Saving Thread...
    `;
    button.disabled = true;
    
    try {
      // Load full thread
      await window.ThreadKeeperParser.loadFullThread();
      
      // Parse thread
      const threadData = await window.ThreadKeeperParser.parseThread();
      
      // Save to storage
      const saved = await window.ThreadKeeperStorage.saveThread(threadData);
      
      // Update UI
      button.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Saved ${threadData.tweets.length} Tweets!
      `;
      button.style.background = 'rgb(0, 186, 124)';
      
      // Send message to background
      chrome.runtime.sendMessage({
        type: 'THREAD_SAVED',
        data: saved
      });
      
      // Reset after delay
      setTimeout(() => {
        button.innerHTML = originalText;
        button.style.background = '';
        button.disabled = false;
      }, 3000);
      
    } catch (error) {
      console.error('Failed to save thread:', error);
      
      button.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Failed to Save
      `;
      button.style.background = 'rgb(244, 33, 46)';
      
      setTimeout(() => {
        button.innerHTML = originalText;
        button.style.background = '';
        button.disabled = false;
      }, 3000);
    }
  }

  isThreadPage() {
    return window.location.pathname.includes('/status/');
  }

  setupEventListeners() {
    // Listen for keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + S to save current thread
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        
        if (this.isThreadPage()) {
          this.saveFullThread();
        } else {
          // Find focused tweet and save it
          const focusedTweet = document.querySelector('[data-testid="tweet"]:focus-within');
          if (focusedTweet) {
            const saveButton = focusedTweet.querySelector('.tk-save-btn');
            if (saveButton) saveButton.click();
          }
        }
      }
    });
    
    // Listen for messages from other parts of the extension
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'CHECK_THREAD') {
        sendResponse({ 
          isThread: this.isThreadPage(),
          url: window.location.href 
        });
      }
    });
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // Remove injected buttons
    document.querySelectorAll('.threadkeeper-save-button').forEach(btn => btn.remove());
    document.querySelectorAll('.tk-thread-save-button').forEach(btn => btn.remove());
    
    // Remove styles
    const styles = document.getElementById('threadkeeper-styles');
    if (styles) styles.remove();
    
    this.isInitialized = false;
  }
}

// Create and initialize button injector
const buttonInjector = new ButtonInjector();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    buttonInjector.initialize();
  });
} else {
  buttonInjector.initialize();
}

// Make available globally
window.ThreadKeeperButtonInjector = buttonInjector;