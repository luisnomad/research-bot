/**
 * X Bookmarks Counter - Rate-Limit Friendly
 * 
 * Scrolls through a bookmarks folder and counts unique bookmarks.
 * Follows conservative timing to respect X's platform rules.
 * 
 * Timing Configuration (from spec):
 * - Between scrolls: 2-3s + random jitter (0-1s)
 * - Max scrolls with no new items: 5 (then stop)
 * - Max total scrolls: 100 (safety limit)
 */

import { WebSocket } from 'ws';

// ============================================================
// Configuration
// ============================================================

const CDP_ENDPOINT = 'http://localhost:9222';
const BOOKMARKS_FOLDER_URL = 'https://x.com/i/bookmarks/1899171982010130843';

// Rate limiting - be nice to X!
const SCROLL_DELAY_MS = 2500;        // Base delay between scrolls
const SCROLL_JITTER_MS = 1000;       // Random additional delay (0-1s)
const SCROLL_AMOUNT_PX = 600;        // Smaller scrolls = more natural
const MAX_NO_NEW_ITEMS = 5;          // Stop after N scrolls with no new items
const MAX_TOTAL_SCROLLS = 100;       // Safety limit
const PAGE_LOAD_WAIT_MS = 5000;      // Wait for dynamic content after navigation

// ============================================================
// Utilities
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomJitter() {
    return Math.floor(Math.random() * SCROLL_JITTER_MS);
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

// ============================================================
// CDP Connection
// ============================================================

async function connectToCDP() {
    console.log('📡 Connecting to Chrome CDP...\n');

    // Get browser info
    const versionResponse = await fetch(`${CDP_ENDPOINT}/json/version`);
    if (!versionResponse.ok) {
        throw new Error('Chrome not running with CDP. Please start Chrome with --remote-debugging-port=9222');
    }

    // Get tabs
    const tabsResponse = await fetch(`${CDP_ENDPOINT}/json/list`);
    const tabs = await tabsResponse.json();

    // Find X tab or first page tab
    let targetTab = tabs.find(t => t.url?.includes('x.com') || t.url?.includes('twitter.com'));
    if (!targetTab) {
        targetTab = tabs.find(t => t.type === 'page');
    }

    if (!targetTab) {
        throw new Error('No suitable tab found');
    }

    console.log(`   🎯 Using tab: ${targetTab.title?.substring(0, 50)}\n`);

    // Connect via WebSocket
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

            // Enable required domains
            await sendCommand('Page.enable');
            await sendCommand('Runtime.enable');

            resolve({ ws, sendCommand });
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
// Bookmark Extraction
// ============================================================

const extractBookmarksScript = `
  (() => {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const bookmarks = [];
    
    articles.forEach(article => {
      const statusLinks = article.querySelectorAll('a[href*="/status/"]');
      const timeElement = article.querySelector('time');
      const tweetText = article.querySelector('[data-testid="tweetText"]');
      
      let statusUrl = null;
      statusLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.match(/\\/[^\\/]+\\/status\\/\\d+$/)) {
          statusUrl = href;
        }
      });
      
      if (statusUrl) {
        const match = statusUrl.match(/\\/([^\\/]+)\\/status\\/(\\d+)/);
        if (match) {
          bookmarks.push({
            statusId: match[2],
            author: '@' + match[1],
            text: tweetText?.innerText?.substring(0, 80) || '',
            url: 'https://x.com' + statusUrl
          });
        }
      }
    });
    
    // Deduplicate by statusId
    const seen = new Set();
    return bookmarks.filter(b => {
      if (seen.has(b.statusId)) return false;
      seen.add(b.statusId);
      return true;
    });
  })()
`;

// ============================================================
// Main Collection Loop
// ============================================================

async function collectAllBookmarks(sendCommand) {
    const startTime = Date.now();
    const allBookmarks = new Map(); // statusId -> bookmark data
    let noNewItemsCount = 0;
    let scrollCount = 0;

    console.log('═══════════════════════════════════════════════════════');
    console.log('  📚 Collecting Bookmarks (Rate-Limit Friendly)');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`   Scroll delay: ${SCROLL_DELAY_MS}ms + 0-${SCROLL_JITTER_MS}ms jitter`);
    console.log(`   Stop after ${MAX_NO_NEW_ITEMS} scrolls with no new items`);
    console.log(`   Safety limit: ${MAX_TOTAL_SCROLLS} scrolls\n`);

    while (scrollCount < MAX_TOTAL_SCROLLS) {
        // Extract visible bookmarks
        const result = await sendCommand('Runtime.evaluate', {
            expression: extractBookmarksScript,
            returnByValue: true
        });

        const visible = result.result.value || [];
        let newItemsFound = 0;

        // Add new bookmarks to our collection
        for (const bookmark of visible) {
            if (!allBookmarks.has(bookmark.statusId)) {
                allBookmarks.set(bookmark.statusId, bookmark);
                newItemsFound++;
            }
        }

        // Progress update
        const elapsed = formatDuration(Date.now() - startTime);
        process.stdout.write(`\r   Scroll #${scrollCount + 1} | Total: ${allBookmarks.size} bookmarks | New: +${newItemsFound} | Time: ${elapsed}   `);

        // Check if we've reached the end
        if (newItemsFound === 0) {
            noNewItemsCount++;
            if (noNewItemsCount >= MAX_NO_NEW_ITEMS) {
                console.log(`\n\n   ✅ Reached end of bookmarks (no new items for ${MAX_NO_NEW_ITEMS} scrolls)`);
                break;
            }
        } else {
            noNewItemsCount = 0;
        }

        // Scroll down gently
        await sendCommand('Runtime.evaluate', {
            expression: `window.scrollBy({ top: ${SCROLL_AMOUNT_PX}, behavior: 'smooth' })`
        });

        // Rate-limit friendly delay with jitter
        const delay = SCROLL_DELAY_MS + randomJitter();
        await sleep(delay);

        scrollCount++;
    }

    if (scrollCount >= MAX_TOTAL_SCROLLS) {
        console.log(`\n\n   ⚠️ Reached safety limit of ${MAX_TOTAL_SCROLLS} scrolls`);
    }

    const totalTime = formatDuration(Date.now() - startTime);

    return {
        bookmarks: Array.from(allBookmarks.values()),
        scrollCount,
        totalTime
    };
}

// ============================================================
// Main
// ============================================================

async function main() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  X Bookmarks Folder Counter');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`   Target: ${BOOKMARKS_FOLDER_URL}\n`);

    try {
        // Connect to Chrome
        const { ws, sendCommand } = await connectToCDP();

        // Navigate to bookmarks folder
        console.log(`   📍 Navigating to bookmarks folder...\n`);
        await sendCommand('Page.navigate', { url: BOOKMARKS_FOLDER_URL });

        // Wait for page to load
        console.log(`   ⏳ Waiting ${PAGE_LOAD_WAIT_MS / 1000}s for content to load...\n`);
        await sleep(PAGE_LOAD_WAIT_MS);

        // Verify we're on the right page
        const urlCheck = await sendCommand('Runtime.evaluate', {
            expression: 'window.location.href'
        });
        console.log(`   📍 Current URL: ${urlCheck.result.value}\n`);

        // Collect all bookmarks
        const { bookmarks, scrollCount, totalTime } = await collectAllBookmarks(sendCommand);

        // Summary
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('  📊 Summary');
        console.log('═══════════════════════════════════════════════════════\n');
        console.log(`   Total bookmarks found: ${bookmarks.length}`);
        console.log(`   Total scrolls: ${scrollCount}`);
        console.log(`   Total time: ${totalTime}`);
        console.log('');

        // Show first few bookmarks
        console.log('   First 5 bookmarks:');
        bookmarks.slice(0, 5).forEach((bm, i) => {
            console.log(`   ${i + 1}. ${bm.author}: "${bm.text.substring(0, 50)}..."`);
        });

        // Show last few bookmarks
        if (bookmarks.length > 5) {
            console.log(`\n   Last 3 bookmarks:`);
            bookmarks.slice(-3).forEach((bm, i) => {
                console.log(`   ${bookmarks.length - 2 + i}. ${bm.author}: "${bm.text.substring(0, 50)}..."`);
            });
        }

        console.log('\n═══════════════════════════════════════════════════════\n');

        // Close connection
        ws.close();

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
