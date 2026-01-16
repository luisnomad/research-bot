/**
 * Truncation Detection PoC
 * 
 * Compares tweet content when viewed in feed vs. when opened directly.
 * Detects "Show more" links and demonstrates the need to open tweets.
 */

import { WebSocket } from 'ws';

const CDP_ENDPOINT = 'http://localhost:9222';
const BOOKMARKS_URL = 'https://x.com/i/bookmarks/1899171982010130843';
const TWEET_URL = 'https://x.com/mdancho84/status/2008518544716099810';

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

// Script to find a specific tweet in the feed and check for truncation
const findTweetInFeedScript = (statusId) => `
(() => {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  
  for (const article of articles) {
    const links = article.querySelectorAll('a[href*="/status/"]');
    
    for (const link of links) {
      if (link.href.includes('${statusId}')) {
        const tweetText = article.querySelector('[data-testid="tweetText"]');
        const showMoreLink = article.querySelector('a[href*="/status/${statusId}"]');
        
        // Check for "Show more" - it's usually styled differently or has specific text
        const allText = article.innerText;
        const hasShowMore = allText.includes('Show more') || 
                           article.querySelector('[data-testid="tweet-text-show-more-link"]') !== null;
        
        // Look for truncation indicator
        const textContent = tweetText?.innerText || '';
        const isTruncated = textContent.endsWith('…') || hasShowMore;
        
        return {
          found: true,
          statusId: '${statusId}',
          textLength: textContent.length,
          textPreview: textContent.substring(0, 300),
          hasShowMore: hasShowMore,
          isTruncated: isTruncated,
          fullArticleText: allText.substring(0, 500)
        };
      }
    }
  }
  
  return { found: false, statusId: '${statusId}' };
})()
`;

// Script to get full tweet content when on tweet page
const getFullTweetScript = `
(() => {
  const mainTweet = document.querySelector('article[data-testid="tweet"]');
  if (!mainTweet) return { error: 'No tweet found' };
  
  const tweetText = mainTweet.querySelector('[data-testid="tweetText"]');
  const textContent = tweetText?.innerText || '';
  
  return {
    textLength: textContent.length,
    textContent: textContent,
    hasShowMore: false
  };
})()
`;

async function main() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  🔍 Truncation Detection PoC');
    console.log('═══════════════════════════════════════════════════════\n');

    try {
        const { ws, sendCommand } = await connectToCDP();

        // Part 1: Check tweet in the bookmark feed
        console.log('📋 PART 1: Checking tweet in bookmark feed\n');
        console.log(`   Navigating to: ${BOOKMARKS_URL}\n`);

        await sendCommand('Page.navigate', { url: BOOKMARKS_URL });
        await sleep(5000);

        // Scroll to find the tweet
        console.log('   Scrolling to find the tweet...\n');
        for (let i = 0; i < 5; i++) {
            const result = await sendCommand('Runtime.evaluate', {
                expression: findTweetInFeedScript('2008518544716099810'),
                returnByValue: true
            });

            if (result.result.value?.found) {
                const feed = result.result.value;
                console.log('   ✅ Found tweet in feed!\n');
                console.log('   ─── Feed View ───────────────────────────────────\n');
                console.log(`   Text Length: ${feed.textLength} characters`);
                console.log(`   Is Truncated: ${feed.isTruncated ? '⚠️ YES' : '✅ NO'}`);
                console.log(`   Has "Show more": ${feed.hasShowMore ? '⚠️ YES' : '✅ NO'}`);
                console.log(`\n   Preview:\n   "${feed.textPreview}..."\n`);
                break;
            }

            // Scroll down
            await sendCommand('Runtime.evaluate', {
                expression: `window.scrollBy({ top: 600, behavior: 'smooth' })`
            });
            await sleep(1500);
        }

        // Part 2: Open the tweet directly
        console.log('\n📄 PART 2: Opening tweet directly\n');
        console.log(`   Navigating to: ${TWEET_URL}\n`);

        await sendCommand('Page.navigate', { url: TWEET_URL });
        await sleep(5000);

        const fullResult = await sendCommand('Runtime.evaluate', {
            expression: getFullTweetScript,
            returnByValue: true
        });

        const full = fullResult.result.value;

        console.log('   ─── Direct View ─────────────────────────────────\n');
        console.log(`   Text Length: ${full.textLength} characters`);
        console.log(`   Has "Show more": ${full.hasShowMore ? '⚠️ YES' : '✅ NO'}`);
        console.log(`\n   Full Content:\n   "${full.textContent}"\n`);

        // Comparison
        console.log('═══════════════════════════════════════════════════════');
        console.log('  📊 Comparison');
        console.log('═══════════════════════════════════════════════════════\n');
        console.log('   Conclusion: To get full tweet content, we should');
        console.log('   open each bookmarked tweet in its own page rather');
        console.log('   than extracting from the feed view.\n');

        ws.close();

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
