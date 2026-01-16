# X Bookmarks Extraction via Chrome DevTools Protocol

## Overview

This skill enables extraction of X (Twitter) bookmarks using Chrome DevTools Protocol (CDP). It connects to an existing Chrome session where the user is logged into X, preserving authentication state.

## Prerequisites

1. **Launch Chrome with Remote Debugging:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-profile-cdp"
```

2. **Log into X (Twitter) in that Chrome instance**

3. **Verify CDP is running:**
```bash
curl http://localhost:9222/json/version
```

## Core Concepts

### CDP Connection (Raw WebSocket, NOT Puppeteer)

```javascript
import { WebSocket } from 'ws';

const CDP_ENDPOINT = 'http://localhost:9222';

async function connectToCDP() {
  // Get tabs
  const tabsResponse = await fetch(`${CDP_ENDPOINT}/json/list`);
  const tabs = await tabsResponse.json();
  
  // Find X tab or first page tab
  let targetTab = tabs.find(t => t.url?.includes('x.com'));
  if (!targetTab) targetTab = tabs.find(t => t.type === 'page');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(targetTab.webSocketDebuggerUrl);
    let messageId = 0;
    const pendingMessages = new Map();
    
    ws.on('open', async () => {
      const sendCommand = (method, params = {}) => {
        return new Promise((res, rej) => {
          const id = ++messageId;
          pendingMessages.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      };
      
      // Enable required CDP domains
      await sendCommand('Page.enable');
      await sendCommand('Runtime.enable');
      
      resolve({ ws, sendCommand });
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.id && pendingMessages.has(message.id)) {
        const { resolve, reject } = pendingMessages.get(message.id);
        pendingMessages.delete(message.id);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      }
    });
    
    ws.on('error', reject);
  });
}
```

### Rate Limiting Configuration

| Action | Delay | Rationale |
|--------|-------|-----------|
| Between scrolls | 2500ms + 0-1000ms jitter | Avoid detection, allow content load |
| Between tweet opens | 5000-8000ms + jitter | Conservative, rate-limit friendly |
| Page load wait | 5000ms | Wait for dynamic content |
| Scroll amount | 600px | Smaller = more natural |

**Chrome GCM Quota:** Chrome has internal limits on CDP usage. Monitor for `QUOTA_EXCEEDED` errors and add cooldown periods.

## Extraction Workflow

### Phase 1: Collect URLs from Bookmark Feed

**DO NOT extract content from feed** - tweets are truncated with "Show more" links.

```javascript
const SCROLL_DELAY_MS = 2500;
const SCROLL_JITTER_MS = 1000;
const MAX_NO_NEW_ITEMS = 5;

const extractUrlsScript = `
  (() => {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const urls = [];
    
    articles.forEach(article => {
      const links = article.querySelectorAll('a[href*="/status/"]');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.match(/\\/[^\\/]+\\/status\\/\\d+$/)) {
          const match = href.match(/\\/([^\\/]+)\\/status\\/(\\d+)/);
          if (match) {
            urls.push({
              url: 'https://x.com' + href,
              author: '@' + match[1],
              statusId: match[2]
            });
          }
        }
      });
    });
    
    // Deduplicate
    const seen = new Set();
    return urls.filter(u => {
      if (seen.has(u.statusId)) return false;
      seen.add(u.statusId);
      return true;
    });
  })()
`;

async function collectBookmarkUrls(sendCommand, folderUrl) {
  await sendCommand('Page.navigate', { url: folderUrl });
  await sleep(5000);
  
  const allUrls = new Map();
  let noNewItems = 0;
  
  while (noNewItems < MAX_NO_NEW_ITEMS) {
    const result = await sendCommand('Runtime.evaluate', {
      expression: extractUrlsScript,
      returnByValue: true
    });
    
    let newFound = 0;
    for (const item of result.result.value || []) {
      if (!allUrls.has(item.statusId)) {
        allUrls.set(item.statusId, item);
        newFound++;
      }
    }
    
    if (newFound === 0) noNewItems++;
    else noNewItems = 0;
    
    // Scroll with jitter
    await sendCommand('Runtime.evaluate', {
      expression: `window.scrollBy({ top: 600, behavior: 'smooth' })`
    });
    await sleep(SCROLL_DELAY_MS + Math.random() * SCROLL_JITTER_MS);
  }
  
  return Array.from(allUrls.values());
}
```

### Phase 2: Process Each URL (Thread Detection)

**Critical:** Open each tweet individually to get full content.

```javascript
const threadDetectionScript = `
(() => {
  const allTweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  if (allTweets.length === 0) return { error: 'No tweets found' };
  
  const getAuthor = (tweet) => {
    const link = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
    return link?.getAttribute('href')?.replace('/', '') || null;
  };
  
  const getTweetText = (tweet) => {
    return tweet.querySelector('[data-testid="tweetText"]')?.innerText || '';
  };
  
  const getTweetUrl = (tweet) => {
    const links = tweet.querySelectorAll('a[href*="/status/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href?.match(/\\/[^\\/]+\\/status\\/\\d+$/)) {
        return 'https://x.com' + href;
      }
    }
    return null;
  };
  
  const mainTweet = allTweets[0];
  const mainAuthor = getAuthor(mainTweet);
  
  // Collect CONSECUTIVE same-author tweets (true thread parts)
  const threadParts = [];
  let threadEnded = false;
  
  for (const tweet of allTweets) {
    const author = getAuthor(tweet);
    
    if (author === mainAuthor && !threadEnded) {
      threadParts.push({
        text: getTweetText(tweet),
        url: getTweetUrl(tweet)
      });
    } else if (author !== mainAuthor) {
      threadEnded = true; // Different author = end of thread
    }
    // Same author after thread ended = later reply, ignore
  }
  
  // Check for images
  const hasImages = mainTweet.querySelector('[data-testid="tweetPhoto"]') !== null;
  
  return {
    author: '@' + mainAuthor,
    isThread: threadParts.length > 1,
    threadParts: threadParts,
    hasImages: hasImages
  };
})()
`;

async function processTweet(sendCommand, url) {
  await sendCommand('Page.navigate', { url });
  await sleep(5000);
  
  // Scroll to load thread parts
  for (let i = 0; i < 3; i++) {
    await sendCommand('Runtime.evaluate', {
      expression: `window.scrollBy({ top: 500, behavior: 'smooth' })`
    });
    await sleep(1200);
  }
  
  const result = await sendCommand('Runtime.evaluate', {
    expression: threadDetectionScript,
    returnByValue: true
  });
  
  return result.result.value;
}
```

## Seed Structure

The output "seed" for LLM triage:

```javascript
{
  url: "https://x.com/author/status/123",
  author: "@author",
  isThread: true,
  threadContent: [
    "Part 1: First tweet (hook)...",
    "Part 2: The real content...",
    "Part 3: Links and resources..."
  ],
  hasImages: false,
  extractedAt: "2026-01-13T21:00:00Z"
}
```

### What to Include:
- ✅ All consecutive thread parts (full text)
- ✅ Author handle and tweet URL
- ✅ Thread detection result
- ✅ Image presence flag

### What to Exclude:
- ❌ Quoted tweet content
- ❌ Later author replies in comments
- ❌ Image download/analysis
- ❌ Replies from other users

## DOM Selectors (Stable as of 2026-01)

| Element | Selector |
|---------|----------|
| Tweet article | `article[data-testid="tweet"]` |
| Tweet text | `[data-testid="tweetText"]` |
| Author name | `[data-testid="User-Name"] a[href^="/"]` |
| Tweet photo | `[data-testid="tweetPhoto"]` |
| Timestamp | `time[datetime]` |
| Status link | `a[href*="/status/"]` |

## Key Findings from PoC

1. **Use raw CDP, not Puppeteer** - Preserves user's login session
2. **Two-phase extraction required** - Feed truncates content (63% loss observed)
3. **Thread detection** - Count CONSECUTIVE same-author tweets only
4. **Rate limiting critical** - Both X and Chrome have limits
5. **No image processing** - Text + flag is sufficient
6. **Bookmark folders work** - URL format: `https://x.com/i/bookmarks/{folder_id}`

## PoC Files Location

```
x-bookmarks-poc/
├── package.json           # Dependencies (ws only)
├── poc.mjs                # Basic CDP connection test
├── count-bookmarks.mjs    # Scroll & count bookmarks
├── detect-thread-v2.mjs   # Thread detection
└── truncation-test.mjs    # Feed vs direct comparison
```

## Full Spec Reference

See `X_BOOKMARKS_CDP_SPEC.md` for complete documentation including:
- Architecture diagrams
- Error handling strategies
- Database schema (SQLite)
- Security considerations
