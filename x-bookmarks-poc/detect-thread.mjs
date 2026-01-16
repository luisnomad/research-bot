/**
 * Thread Detection PoC
 * 
 * Tests the thread detection heuristics from the spec on a real tweet.
 * Navigates to a tweet and:
 * 1. Detects if it's a thread
 * 2. Counts thread parts
 * 3. Extracts all thread content
 */

import { WebSocket } from 'ws';

const CDP_ENDPOINT = 'http://localhost:9222';
const TWEET_URL = process.argv[2] || 'https://x.com/itsPaulAi/status/1950599438046576825';
const PAGE_LOAD_WAIT_MS = 5000;

// ============================================================
// Utilities
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// CDP Connection
// ============================================================

async function connectToCDP() {
    const tabsResponse = await fetch(`${CDP_ENDPOINT}/json/list`);
    const tabs = await tabsResponse.json();

    let targetTab = tabs.find(t => t.url?.includes('x.com') || t.url?.includes('twitter.com'));
    if (!targetTab) {
        targetTab = tabs.find(t => t.type === 'page');
    }

    if (!targetTab) {
        throw new Error('No suitable tab found');
    }

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

            await sendCommand('Page.enable');
            await sendCommand('Runtime.enable');

            resolve({ ws, sendCommand, tabTitle: targetTab.title });
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.id && pendingMessages.has(message.id)) {
                const { resolve, reject } = pendingMessages.get(message.id);
                pendingMessages.delete(message.id);
                if (message.error) {
                    reject(new Error(message.error.message));
                } else {
                    resolve(message.result);
                }
            }
        });

        ws.on('error', reject);
    });
}

// ============================================================
// Thread Detection Script (from spec)
// ============================================================

const threadDetectionScript = `
(() => {
  const results = {
    indicators: [],
    threadParts: [],
    mainTweet: null,
    isThread: false,
    confidence: 0,
    method: 'none'
  };
  
  // Get all tweet articles
  const allTweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  if (allTweets.length === 0) {
    return { error: 'No tweets found on page' };
  }
  
  // The main tweet is usually the first one on a status page
  const mainTweet = allTweets[0];
  
  // Helper functions
  const getAuthor = (tweet) => {
    const link = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
    return link?.getAttribute('href')?.replace('/', '') || null;
  };
  
  const getTimestamp = (tweet) => {
    const time = tweet.querySelector('time');
    return time ? new Date(time.getAttribute('datetime')).getTime() : 0;
  };
  
  const getTweetText = (tweet) => {
    const textEl = tweet.querySelector('[data-testid="tweetText"]');
    return textEl?.innerText || '';
  };
  
  const getTweetUrl = (tweet) => {
    const links = tweet.querySelectorAll('a[href*="/status/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.match(/\\/[^\\/]+\\/status\\/\\d+$/)) {
        return 'https://x.com' + href;
      }
    }
    return null;
  };
  
  // Extract main tweet info
  const mainAuthor = getAuthor(mainTweet);
  const mainText = getTweetText(mainTweet);
  const mainTimestamp = getTimestamp(mainTweet);
  
  results.mainTweet = {
    author: '@' + mainAuthor,
    text: mainText.substring(0, 200),
    url: getTweetUrl(mainTweet)
  };
  
  // ─────────────────────────────────────────────────────────
  // INDICATOR 1: UI Elements (highest confidence)
  // ─────────────────────────────────────────────────────────
  
  const showThreadButton = document.querySelector('[aria-label*="Show this thread"]');
  if (showThreadButton) {
    results.indicators.push({ method: 'ui_show_thread_button', confidence: 0.95 });
  }
  
  // Check for thread connector lines (vertical lines between tweets)
  const threadConnectors = document.querySelectorAll('[data-testid="cellInnerDiv"] > div > div > div[style*="border"]');
  if (threadConnectors.length > 0) {
    results.indicators.push({ method: 'thread_connector_visual', confidence: 0.85 });
  }
  
  // ─────────────────────────────────────────────────────────
  // INDICATOR 2: Content Patterns (medium-high confidence)
  // ─────────────────────────────────────────────────────────
  
  // Numbered thread patterns: "1/", "(1/5)", "1/n", "🧵 1/"
  if (/[\\(]?1\\s*\\/\\s*[\\d\\w\\)]?/.test(mainText)) {
    results.indicators.push({ method: 'numbered_pattern', confidence: 0.85 });
  }
  
  // Explicit thread markers
  const threadMarkers = ['thread:', '🧵', 'a thread', 'thread 👇', '👇 thread'];
  const lowerText = mainText.toLowerCase();
  for (const marker of threadMarkers) {
    if (lowerText.includes(marker.toLowerCase())) {
      results.indicators.push({ method: 'explicit_marker: ' + marker, confidence: 0.80 });
      break;
    }
  }
  
  // ─────────────────────────────────────────────────────────
  // INDICATOR 3: Author Continuation
  // ─────────────────────────────────────────────────────────
  
  let sameAuthorCount = 0;
  let consecutiveSameAuthor = true;
  
  for (let i = 0; i < allTweets.length; i++) {
    const tweet = allTweets[i];
    const tweetAuthor = getAuthor(tweet);
    const tweetText = getTweetText(tweet);
    const tweetUrl = getTweetUrl(tweet);
    const tweetTimestamp = getTimestamp(tweet);
    
    if (tweetAuthor === mainAuthor) {
      sameAuthorCount++;
      results.threadParts.push({
        partNumber: results.threadParts.length + 1,
        author: '@' + tweetAuthor,
        text: tweetText.substring(0, 500),
        url: tweetUrl,
        timestamp: new Date(tweetTimestamp).toISOString()
      });
    } else if (i > 0) {
      consecutiveSameAuthor = false;
    }
  }
  
  if (sameAuthorCount >= 2) {
    results.indicators.push({ 
      method: 'same_author_multiple_tweets', 
      confidence: consecutiveSameAuthor ? 0.90 : 0.70,
      count: sameAuthorCount
    });
  }
  
  // ─────────────────────────────────────────────────────────
  // INDICATOR 4: Self-Reply Detection
  // ─────────────────────────────────────────────────────────
  
  // Check if tweets have "Replying to" pointing to same author
  const replyingToElements = document.querySelectorAll('[data-testid="tweet"] a[href*="/' + mainAuthor + '"]');
  const selfReplies = Array.from(replyingToElements).filter(el => {
    const text = el.closest('[data-testid="tweet"]')?.textContent || '';
    return text.includes('Replying to');
  });
  
  if (selfReplies.length > 0) {
    results.indicators.push({ 
      method: 'self_reply_detected', 
      confidence: 0.85,
      count: selfReplies.length 
    });
  }
  
  // ─────────────────────────────────────────────────────────
  // AGGREGATE CONFIDENCE
  // ─────────────────────────────────────────────────────────
  
  if (results.indicators.length === 0) {
    results.isThread = false;
    results.confidence = 0;
    results.method = 'none';
  } else {
    // Use highest confidence indicator
    const best = results.indicators.reduce((a, b) => 
      a.confidence > b.confidence ? a : b
    );
    
    let finalConfidence = best.confidence;
    
    // Boost for multiple confirming indicators
    if (results.indicators.length >= 2) {
      finalConfidence = Math.min(finalConfidence + 0.05, 1.0);
    }
    if (results.indicators.length >= 3) {
      finalConfidence = Math.min(finalConfidence + 0.05, 1.0);
    }
    
    results.isThread = finalConfidence >= 0.60;
    results.confidence = finalConfidence;
    results.method = best.method;
  }
  
  results.totalTweetsOnPage = allTweets.length;
  results.threadPartCount = results.threadParts.length;
  
  return results;
})()
`;

// ============================================================
// Main
// ============================================================

async function main() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  🧵 Thread Detection PoC');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`   Target: ${TWEET_URL}\n`);

    try {
        // Connect to Chrome
        console.log('📡 Connecting to Chrome CDP...\n');
        const { ws, sendCommand, tabTitle } = await connectToCDP();
        console.log(`   🎯 Using tab: ${tabTitle?.substring(0, 50)}\n`);

        // Navigate to tweet
        console.log(`   📍 Navigating to tweet...\n`);
        await sendCommand('Page.navigate', { url: TWEET_URL });

        // Wait for page to load
        console.log(`   ⏳ Waiting ${PAGE_LOAD_WAIT_MS / 1000}s for content...\n`);
        await sleep(PAGE_LOAD_WAIT_MS);

        // Scroll down a bit to load more thread parts
        console.log('   📜 Scrolling to load more thread parts...\n');
        for (let i = 0; i < 3; i++) {
            await sendCommand('Runtime.evaluate', {
                expression: `window.scrollBy({ top: 800, behavior: 'smooth' })`
            });
            await sleep(1500);
        }

        // Scroll back to top
        await sendCommand('Runtime.evaluate', {
            expression: `window.scrollTo({ top: 0, behavior: 'smooth' })`
        });
        await sleep(1000);

        // Run thread detection
        console.log('🔍 Running thread detection...\n');
        const result = await sendCommand('Runtime.evaluate', {
            expression: threadDetectionScript,
            returnByValue: true
        });

        const detection = result.result.value;

        if (detection.error) {
            console.log(`   ❌ Error: ${detection.error}\n`);
            ws.close();
            return;
        }

        // Display results
        console.log('═══════════════════════════════════════════════════════');
        console.log('  📊 Detection Results');
        console.log('═══════════════════════════════════════════════════════\n');

        console.log(`   Is Thread: ${detection.isThread ? '✅ YES' : '❌ NO'}`);
        console.log(`   Confidence: ${(detection.confidence * 100).toFixed(0)}%`);
        console.log(`   Primary Method: ${detection.method}`);
        console.log(`   Thread Parts: ${detection.threadPartCount}`);
        console.log(`   Total Tweets on Page: ${detection.totalTweetsOnPage}\n`);

        console.log('─── Main Tweet ───────────────────────────────────────\n');
        console.log(`   Author: ${detection.mainTweet?.author}`);
        console.log(`   Text: "${detection.mainTweet?.text?.substring(0, 100)}..."\n`);

        console.log('─── Detection Indicators ─────────────────────────────\n');
        if (detection.indicators.length === 0) {
            console.log('   (none detected)\n');
        } else {
            detection.indicators.forEach((ind, i) => {
                console.log(`   ${i + 1}. ${ind.method}`);
                console.log(`      Confidence: ${(ind.confidence * 100).toFixed(0)}%`);
                if (ind.count) console.log(`      Count: ${ind.count}`);
                console.log('');
            });
        }

        if (detection.threadParts.length > 0) {
            console.log('─── Thread Parts ─────────────────────────────────────\n');
            detection.threadParts.forEach((part, i) => {
                console.log(`   Part ${part.partNumber}:`);
                console.log(`   "${part.text.substring(0, 100)}..."\n`);
            });
        }

        console.log('═══════════════════════════════════════════════════════\n');

        // Close connection
        ws.close();

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
