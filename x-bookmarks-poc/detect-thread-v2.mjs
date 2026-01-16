/**
 * Thread Detection PoC v2 - Improved
 * 
 * Improvements:
 * 1. Only counts CONSECUTIVE tweets from the same author (true thread parts)
 * 2. Distinguishes thread from later author replies
 * 3. Better structural analysis using DOM position
 * 4. Detects reply chain structure
 */

import { WebSocket } from 'ws';

const CDP_ENDPOINT = 'http://localhost:9222';
const TWEET_URL = process.argv[2] || 'https://x.com/itsPaulAi/status/1950599438046576825';
const PAGE_LOAD_WAIT_MS = 5000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectToCDP() {
    const tabsResponse = await fetch(`${CDP_ENDPOINT}/json/list`);
    const tabs = await tabsResponse.json();

    let targetTab = tabs.find(t => t.url?.includes('x.com') || t.url?.includes('twitter.com'));
    if (!targetTab) targetTab = tabs.find(t => t.type === 'page');
    if (!targetTab) throw new Error('No suitable tab found');

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
                message.error ? reject(new Error(message.error.message)) : resolve(message.result);
            }
        });

        ws.on('error', reject);
    });
}

// ============================================================
// IMPROVED Thread Detection Script
// ============================================================

const threadDetectionScriptV2 = `
(() => {
  const results = {
    indicators: [],
    threadParts: [],
    laterReplies: [],
    mainTweet: null,
    isThread: false,
    confidence: 0,
    method: 'none',
    analysis: {}
  };
  
  // Get all tweet articles in DOM order
  const allTweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  if (allTweets.length === 0) {
    return { error: 'No tweets found on page' };
  }
  
  // Helper functions
  const getAuthor = (tweet) => {
    const link = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
    return link?.getAttribute('href')?.replace('/', '') || null;
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
  
  const getTimestamp = (tweet) => {
    const time = tweet.querySelector('time');
    return time ? time.getAttribute('datetime') : null;
  };
  
  // Check if a tweet has a thread connector line above it
  const hasThreadConnector = (tweet) => {
    // Look for the vertical thread line in parent containers
    const parent = tweet.closest('[data-testid="cellInnerDiv"]');
    if (!parent) return false;
    
    // The thread connector is usually a div with specific styling before the tweet
    const prevSibling = parent.previousElementSibling;
    if (prevSibling) {
      const hasLine = prevSibling.querySelector('[style*="border"]') || 
                      prevSibling.querySelector('[style*="background-color"]');
      if (hasLine) return true;
    }
    
    // Also check for inline thread lines
    const inlineConnector = tweet.parentElement?.querySelector('[style*="flex"][style*="column"]');
    return !!inlineConnector;
  };
  
  // The main tweet is the first one
  const mainTweet = allTweets[0];
  const mainAuthor = getAuthor(mainTweet);
  const mainText = getTweetText(mainTweet);
  
  results.mainTweet = {
    author: '@' + mainAuthor,
    text: mainText.substring(0, 200),
    url: getTweetUrl(mainTweet),
    timestamp: getTimestamp(mainTweet)
  };
  
  // ─────────────────────────────────────────────────────────
  // PHASE 1: Find CONSECUTIVE same-author tweets (true thread)
  // ─────────────────────────────────────────────────────────
  
  let consecutiveCount = 0;
  let threadEnded = false;
  
  for (let i = 0; i < allTweets.length; i++) {
    const tweet = allTweets[i];
    const author = getAuthor(tweet);
    const text = getTweetText(tweet);
    const url = getTweetUrl(tweet);
    const timestamp = getTimestamp(tweet);
    
    if (author === mainAuthor && !threadEnded) {
      consecutiveCount++;
      results.threadParts.push({
        partNumber: consecutiveCount,
        author: '@' + author,
        text: text.substring(0, 500),
        url: url,
        timestamp: timestamp,
        hasConnector: hasThreadConnector(tweet)
      });
    } else if (author !== mainAuthor) {
      // Different author = end of consecutive thread
      threadEnded = true;
    } else if (author === mainAuthor && threadEnded) {
      // Same author but after thread ended = later reply
      results.laterReplies.push({
        author: '@' + author,
        text: text.substring(0, 200),
        url: url
      });
    }
  }
  
  // ─────────────────────────────────────────────────────────
  // PHASE 2: Apply detection indicators
  // ─────────────────────────────────────────────────────────
  
  // Consecutive same-author tweets is the strongest signal
  if (consecutiveCount >= 2) {
    results.indicators.push({
      method: 'consecutive_same_author',
      confidence: Math.min(0.70 + (consecutiveCount - 2) * 0.05, 0.95),
      consecutiveCount: consecutiveCount
    });
  }
  
  // Content patterns in main tweet
  if (/[\\(]?1\\s*\\/\\s*[\\d\\w\\)]/.test(mainText)) {
    results.indicators.push({ method: 'numbered_pattern', confidence: 0.90 });
  }
  
  const threadMarkers = ['thread:', '🧵', 'a thread', 'thread 👇', '👇 thread', '(thread)'];
  const lowerText = mainText.toLowerCase();
  for (const marker of threadMarkers) {
    if (lowerText.includes(marker.toLowerCase())) {
      results.indicators.push({ method: 'explicit_marker: ' + marker, confidence: 0.85 });
      break;
    }
  }
  
  // Thread connector visual lines
  const partsWithConnectors = results.threadParts.filter(p => p.hasConnector).length;
  if (partsWithConnectors >= 1) {
    results.indicators.push({
      method: 'thread_connector_lines',
      confidence: 0.85,
      count: partsWithConnectors
    });
  }
  
  // Check for "Show this thread" button
  const showThreadBtn = document.querySelector('[aria-label*="Show this thread"]');
  if (showThreadBtn) {
    results.indicators.push({ method: 'ui_show_thread_button', confidence: 0.95 });
  }
  
  // ─────────────────────────────────────────────────────────
  // PHASE 3: Calculate final confidence
  // ─────────────────────────────────────────────────────────
  
  if (results.indicators.length === 0) {
    results.isThread = false;
    results.confidence = 0;
    results.method = 'none';
  } else {
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
    
    results.isThread = finalConfidence >= 0.60 && consecutiveCount >= 2;
    results.confidence = finalConfidence;
    results.method = best.method;
  }
  
  results.analysis = {
    totalTweetsOnPage: allTweets.length,
    consecutiveThreadParts: consecutiveCount,
    laterAuthorReplies: results.laterReplies.length,
    mainAuthor: '@' + mainAuthor
  };
  
  return results;
})()
`;

// ============================================================
// Main
// ============================================================

async function main() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  🧵 Thread Detection PoC v2 (Improved)');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`   Target: ${TWEET_URL}\n`);

    try {
        console.log('📡 Connecting to Chrome CDP...\n');
        const { ws, sendCommand, tabTitle } = await connectToCDP();
        console.log(`   🎯 Using tab: ${tabTitle?.substring(0, 50)}\n`);

        console.log(`   📍 Navigating to tweet...\n`);
        await sendCommand('Page.navigate', { url: TWEET_URL });

        console.log(`   ⏳ Waiting ${PAGE_LOAD_WAIT_MS / 1000}s for content...\n`);
        await sleep(PAGE_LOAD_WAIT_MS);

        // Scroll to load thread parts (scroll more to ensure all parts load)
        console.log('   📜 Scrolling to load thread parts...\n');
        for (let i = 0; i < 4; i++) {
            await sendCommand('Runtime.evaluate', {
                expression: `window.scrollBy({ top: 500, behavior: 'smooth' })`
            });
            await sleep(1200);
        }

        // Scroll back to top
        await sendCommand('Runtime.evaluate', {
            expression: `window.scrollTo({ top: 0, behavior: 'smooth' })`
        });
        await sleep(1000);

        // Run improved thread detection
        console.log('🔍 Running improved thread detection...\n');
        const result = await sendCommand('Runtime.evaluate', {
            expression: threadDetectionScriptV2,
            returnByValue: true
        });

        const d = result.result.value;

        if (d.error) {
            console.log(`   ❌ Error: ${d.error}\n`);
            ws.close();
            return;
        }

        // Display results
        console.log('═══════════════════════════════════════════════════════');
        console.log('  📊 Detection Results');
        console.log('═══════════════════════════════════════════════════════\n');

        console.log(`   Is Thread: ${d.isThread ? '✅ YES' : '❌ NO'}`);
        console.log(`   Confidence: ${(d.confidence * 100).toFixed(0)}%`);
        console.log(`   Primary Method: ${d.method}`);
        console.log('');

        console.log('─── Analysis ─────────────────────────────────────────\n');
        console.log(`   Main Author: ${d.analysis.mainAuthor}`);
        console.log(`   Consecutive Thread Parts: ${d.analysis.consecutiveThreadParts}`);
        console.log(`   Later Author Replies: ${d.analysis.laterAuthorReplies}`);
        console.log(`   Total Tweets on Page: ${d.analysis.totalTweetsOnPage}`);
        console.log('');

        console.log('─── Main Tweet ───────────────────────────────────────\n');
        console.log(`   Author: ${d.mainTweet?.author}`);
        console.log(`   Text: "${d.mainTweet?.text?.substring(0, 100)}..."\n`);

        console.log('─── Detection Indicators ─────────────────────────────\n');
        if (d.indicators.length === 0) {
            console.log('   (none detected)\n');
        } else {
            d.indicators.forEach((ind, i) => {
                console.log(`   ${i + 1}. ${ind.method}`);
                console.log(`      Confidence: ${(ind.confidence * 100).toFixed(0)}%`);
                if (ind.consecutiveCount) console.log(`      Consecutive: ${ind.consecutiveCount}`);
                if (ind.count) console.log(`      Count: ${ind.count}`);
                console.log('');
            });
        }

        console.log('─── Thread Parts (Consecutive) ───────────────────────\n');
        d.threadParts.forEach((part, i) => {
            const connector = part.hasConnector ? ' 🔗' : '';
            console.log(`   Part ${part.partNumber}:${connector}`);
            console.log(`   "${part.text.substring(0, 80)}..."\n`);
        });

        if (d.laterReplies.length > 0) {
            console.log('─── Later Author Replies (not part of thread) ────────\n');
            d.laterReplies.slice(0, 3).forEach((reply, i) => {
                console.log(`   Reply ${i + 1}: "${reply.text.substring(0, 60)}..."\n`);
            });
            if (d.laterReplies.length > 3) {
                console.log(`   ... and ${d.laterReplies.length - 3} more\n`);
            }
        }

        console.log('═══════════════════════════════════════════════════════\n');

        ws.close();

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
