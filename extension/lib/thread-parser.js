// lib/thread-parser.js - Twitter/X thread parsing and extraction

class ThreadParser {
  constructor() {
    // Twitter/X uses React, so we need to access React props
    this.REACT_PROPS_KEY = Object.keys(document.querySelector('[data-testid="tweet"]') || {})
      .find(key => key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber'));
    
    // Selectors for Twitter/X elements
    this.SELECTORS = {
      tweet: '[data-testid="tweet"]',
      tweetText: '[data-testid="tweetText"]',
      username: '[data-testid="User-Name"]',
      avatar: 'img[draggable="true"]',
      timestamp: 'time',
      likes: '[data-testid="like"]',
      retweets: '[data-testid="retweet"]',
      replies: '[data-testid="reply"]',
      media: '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"]',
      thread: '[data-testid="cellInnerDiv"]',
      profileLink: 'a[role="link"][href*="/"]'
    };
  }

  // Main method to parse a complete thread
  async parseThread() {
    try {
      const threadData = await this.extractThreadFromPage();
      if (!threadData || threadData.tweets.length === 0) {
        throw new Error('No thread data found');
      }
      
      return {
        ...threadData,
        parsedAt: Date.now(),
        url: window.location.href
      };
    } catch (error) {
      console.error('Failed to parse thread:', error);
      throw error;
    }
  }

  // Extract thread data from the current page
  async extractThreadFromPage() {
    // Wait for tweets to load
    await this.waitForElement(this.SELECTORS.tweet);
    
    // Get all tweet elements in the thread
    const tweetElements = this.getTweetElements();
    if (tweetElements.length === 0) {
      return null;
    }

    // Extract author info from the first tweet
    const authorInfo = this.extractAuthorInfo(tweetElements[0]);
    
    // Extract all tweets in the thread
    const tweets = [];
    let previousAuthor = null;
    
    for (const element of tweetElements) {
      const tweetData = this.extractTweetData(element);
      
      // Check if this is part of the main thread (same author)
      if (!previousAuthor) {
        previousAuthor = tweetData.authorUsername;
        tweets.push(tweetData);
      } else if (tweetData.authorUsername === previousAuthor) {
        tweets.push(tweetData);
      } else if (this.isReplyInThread(element, previousAuthor)) {
        // Include replies that are part of the conversation
        tweets.push(tweetData);
      }
    }

    // Get engagement metrics from the main tweet
    const engagementData = this.extractEngagementData(tweetElements[0]);

    return {
      ...authorInfo,
      tweets,
      ...engagementData,
      threadLength: tweets.length
    };
  }

  // Get all tweet elements from the page
  getTweetElements() {
    const tweets = document.querySelectorAll(this.SELECTORS.tweet);
    return Array.from(tweets).filter(tweet => {
      // Filter out promoted tweets and recommendations
      const text = tweet.innerText || '';
      return !text.includes('Promoted') && !text.includes('Suggested');
    });
  }

  // Extract author information from a tweet element
  extractAuthorInfo(tweetElement) {
    try {
      const usernameElement = tweetElement.querySelector(this.SELECTORS.username);
      const avatarElement = tweetElement.querySelector(this.SELECTORS.avatar);
      
      let username = '';
      let displayName = '';
      
      if (usernameElement) {
        const spans = usernameElement.querySelectorAll('span');
        spans.forEach(span => {
          const text = span.innerText;
          if (text.startsWith('@')) {
            username = text.substring(1);
          } else if (text && !text.includes('·') && text !== ' ') {
            displayName = text;
          }
        });
      }

      return {
        authorUsername: username,
        authorName: displayName || username,
        authorAvatar: avatarElement?.src || '',
        authorVerified: !!tweetElement.querySelector('[data-testid="icon-verified"]')
      };
    } catch (error) {
      console.error('Failed to extract author info:', error);
      return {
        authorUsername: 'unknown',
        authorName: 'Unknown User',
        authorAvatar: '',
        authorVerified: false
      };
    }
  }

  // Extract data from a single tweet element
  extractTweetData(tweetElement) {
    const textElement = tweetElement.querySelector(this.SELECTORS.tweetText);
    const timeElement = tweetElement.querySelector(this.SELECTORS.timestamp);
    
    // Extract tweet text
    let tweetText = '';
    if (textElement) {
      // Get all text nodes to preserve formatting
      const walker = document.createTreeWalker(
        textElement,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
          tweetText += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'BR') {
            tweetText += '\n';
          } else if (node.tagName === 'A' && node.href) {
            // Preserve links
            tweetText += node.innerText;
          }
        }
      }
    }

    // Extract media
    const media = this.extractMedia(tweetElement);
    
    // Extract author info for this specific tweet (might be different in replies)
    const authorInfo = this.extractAuthorInfo(tweetElement);

    return {
      id: this.extractTweetId(tweetElement),
      text: tweetText.trim(),
      timestamp: timeElement?.dateTime || null,
      authorUsername: authorInfo.authorUsername,
      authorName: authorInfo.authorName,
      media,
      isReply: this.isReply(tweetElement),
      hasQuoteTweet: !!tweetElement.querySelector('[data-testid="quoteTweet"]'),
      links: this.extractLinks(tweetElement)
    };
  }

  // Extract media from a tweet
  extractMedia(tweetElement) {
    const media = [];
    
    // Images
    const images = tweetElement.querySelectorAll('[data-testid="tweetPhoto"] img');
    images.forEach(img => {
      media.push({
        type: 'image',
        url: img.src,
        alt: img.alt || ''
      });
    });

    // Videos
    const videos = tweetElement.querySelectorAll('[data-testid="videoPlayer"]');
    videos.forEach(video => {
      media.push({
        type: 'video',
        thumbnail: video.querySelector('img')?.src || '',
        // Video URL would need to be extracted from network requests
      });
    });

    // Cards (link previews)
    const cards = tweetElement.querySelectorAll('[data-testid="card.wrapper"]');
    cards.forEach(card => {
      media.push({
        type: 'card',
        url: card.querySelector('a')?.href || '',
        title: card.querySelector('[data-testid="card.layoutLarge.detail"] > div')?.innerText || '',
        thumbnail: card.querySelector('img')?.src || ''
      });
    });

    return media;
  }

  // Extract links from tweet text
  extractLinks(tweetElement) {
    const links = [];
    const linkElements = tweetElement.querySelectorAll('a[href^="http"]');
    
    linkElements.forEach(link => {
      if (!link.href.includes('twitter.com') && !link.href.includes('x.com')) {
        links.push({
          url: link.href,
          display: link.innerText
        });
      }
    });

    return links;
  }

  // Extract engagement metrics
  extractEngagementData(tweetElement) {
    const getCount = (selector) => {
      const element = tweetElement.querySelector(selector);
      if (!element) return 0;
      
      const ariaLabel = element.getAttribute('aria-label') || '';
      const match = ariaLabel.match(/(\d+(?:,\d+)*)/);
      if (match) {
        return parseInt(match[1].replace(/,/g, ''), 10);
      }
      
      // Fallback to text content
      const text = element.innerText || '';
      const numberMatch = text.match(/(\d+(?:\.\d+)?[KMB]?)/);
      if (numberMatch) {
        return this.parseFormattedNumber(numberMatch[1]);
      }
      
      return 0;
    };

    return {
      likes: getCount(this.SELECTORS.likes),
      retweets: getCount(this.SELECTORS.retweets),
      replies: getCount(this.SELECTORS.replies)
    };
  }

  // Parse formatted numbers (1.2K, 3M, etc.)
  parseFormattedNumber(str) {
    const multipliers = {
      'K': 1000,
      'M': 1000000,
      'B': 1000000000
    };
    
    const match = str.match(/(\d+(?:\.\d+)?)\s*([KMB])?/);
    if (match) {
      const num = parseFloat(match[1]);
      const multiplier = multipliers[match[2]] || 1;
      return Math.round(num * multiplier);
    }
    
    return parseInt(str.replace(/,/g, ''), 10) || 0;
  }

  // Extract tweet ID from element or URL
  extractTweetId(tweetElement) {
    try {
      // Try to get from link
      const statusLink = tweetElement.querySelector('a[href*="/status/"]');
      if (statusLink) {
        const match = statusLink.href.match(/\/status\/(\d+)/);
        if (match) return match[1];
      }
      
      // Try to get from time element
      const timeLink = tweetElement.querySelector('time')?.parentElement;
      if (timeLink?.href) {
        const match = timeLink.href.match(/\/status\/(\d+)/);
        if (match) return match[1];
      }
      
      // Fallback to generating an ID
      return `tweet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
      return `tweet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  // Check if a tweet is a reply
  isReply(tweetElement) {
    // Check for "Replying to" text
    const replyingTo = Array.from(tweetElement.querySelectorAll('span')).some(
      span => span.innerText.includes('Replying to')
    );
    return replyingTo;
  }

  // Check if a reply is part of the main thread
  isReplyInThread(tweetElement, mainAuthor) {
    const authorInfo = this.extractAuthorInfo(tweetElement);
    
    // Check if it's a reply from the same author (thread continuation)
    if (authorInfo.authorUsername === mainAuthor) {
      return true;
    }
    
    // Check if the main author is mentioned in the reply
    const text = tweetElement.innerText || '';
    return text.includes(`@${mainAuthor}`);
  }

  // Wait for an element to appear
  waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  // Scroll to load more tweets in a thread
  async loadFullThread(maxScrolls = 10) {
    let previousHeight = document.body.scrollHeight;
    let scrollCount = 0;
    
    while (scrollCount < maxScrolls) {
      window.scrollTo(0, document.body.scrollHeight);
      await this.sleep(1500);
      
      const currentHeight = document.body.scrollHeight;
      if (currentHeight === previousHeight) {
        // No new content loaded
        break;
      }
      
      previousHeight = currentHeight;
      scrollCount++;
    }
    
    // Scroll back to top
    window.scrollTo(0, 0);
  }

  // Utility sleep function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get thread from a specific tweet URL
  async parseThreadFromUrl(url) {
    if (!url.includes('/status/')) {
      throw new Error('Invalid tweet URL');
    }

    // Navigate to URL if not already there
    if (window.location.href !== url) {
      window.location.href = url;
      // Wait for navigation
      await this.waitForElement(this.SELECTORS.tweet, 10000);
    }

    // Load full thread
    await this.loadFullThread();

    // Parse the thread
    return this.parseThread();
  }

  // Check if current page is a thread
  isThreadPage() {
    return window.location.pathname.includes('/status/');
  }

  // Check if current page is Twitter/X
  isTwitterPage() {
    const hostname = window.location.hostname;
    return hostname.includes('twitter.com') || hostname.includes('x.com');
  }
}

// Create and export singleton instance
const threadParser = new ThreadParser();

// Make it available globally for the extension
if (typeof window !== 'undefined') {
  window.ThreadKeeperParser = threadParser;
}