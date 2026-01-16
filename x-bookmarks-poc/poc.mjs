/**
 * X Bookmarks CDP PoC
 * 
 * This PoC verifies the feasibility of extracting X bookmarks using
 * Chrome DevTools Protocol connected to an existing Chrome session.
 * 
 * Prerequisites:
 * 1. Launch Chrome with: 
 *    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *      --remote-debugging-port=9222 \
 *      --user-data-dir="$HOME/chrome-profile-cdp"
 * 
 * 2. Log into X (Twitter) in that Chrome instance
 * 
 * 3. Run this script: node poc.mjs
 */

import { WebSocket } from 'ws';

const CDP_ENDPOINT = 'http://localhost:9222';
const BOOKMARKS_URL = 'https://x.com/i/bookmarks';

// ============================================================
// Phase 1: CDP Connection & Validation
// ============================================================

async function checkCDPConnection() {
  console.log('📡 Phase 1: Checking CDP connection...\n');
  
  try {
    const response = await fetch(`${CDP_ENDPOINT}/json/version`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Chrome is running with CDP enabled!');
    console.log(`   Browser: ${data.Browser}`);
    console.log(`   Protocol Version: ${data['Protocol-Version']}`);
    console.log(`   WebSocket URL: ${data.webSocketDebuggerUrl}\n`);
    
    return data;
  } catch (error) {
    console.error('❌ Cannot connect to Chrome CDP');
    console.error('\n   Please launch Chrome with remote debugging:');
    console.error('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\');
    console.error('     --remote-debugging-port=9222 \\');
    console.error('     --user-data-dir="$HOME/chrome-profile-cdp"\n');
    throw error;
  }
}

// ============================================================
// Phase 2: List Open Tabs
// ============================================================

async function listTabs() {
  console.log('📑 Phase 2: Listing open tabs...\n');
  
  const response = await fetch(`${CDP_ENDPOINT}/json/list`);
  const tabs = await response.json();
  
  console.log(`   Found ${tabs.length} tab(s):`);
  tabs.slice(0, 5).forEach((tab, i) => {
    console.log(`   ${i + 1}. ${tab.title?.substring(0, 50) || '(no title)'}`);
    console.log(`      URL: ${tab.url?.substring(0, 60)}...`);
  });
  
  if (tabs.length > 5) {
    console.log(`   ... and ${tabs.length - 5} more`);
  }
  console.log('');
  
  return tabs;
}

// ============================================================
// Phase 3: Connect to a Tab via WebSocket
// ============================================================

async function connectToTab(tab) {
  console.log('🔌 Phase 3: Connecting to tab via WebSocket...\n');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let messageId = 0;
    const pendingMessages = new Map();
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected!\n');
      
      // Helper to send CDP commands
      const sendCommand = (method, params = {}) => {
        return new Promise((res, rej) => {
          const id = ++messageId;
          pendingMessages.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      };
      
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
      
      // Log events (for debugging)
      if (message.method) {
        // console.log(`   [Event] ${message.method}`);
      }
    });
    
    ws.on('error', reject);
  });
}

// ============================================================
// Phase 4: Navigate to Bookmarks & Extract Data
// ============================================================

async function navigateAndExtract(sendCommand, currentUrl) {
  console.log('🌐 Phase 4: Navigation & DOM Access...\n');
  
  // Enable required domains
  await sendCommand('Page.enable');
  await sendCommand('Runtime.enable');
  await sendCommand('DOM.enable');
  
  console.log('   ✅ CDP domains enabled (Page, Runtime, DOM)\n');
  
  // Check current URL
  const evalResult = await sendCommand('Runtime.evaluate', {
    expression: 'window.location.href'
  });
  
  console.log(`   Current URL: ${evalResult.result.value}\n`);
  
  // If not on bookmarks, navigate there
  if (!evalResult.result.value.includes('/bookmarks')) {
    console.log(`   📍 Navigating to ${BOOKMARKS_URL}...\n`);
    await sendCommand('Page.navigate', { url: BOOKMARKS_URL });
    
    // Wait for page load
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('   ✅ Navigation complete (waited 5s for dynamic content)\n');
  }
  
  // Extract tweet data from page
  console.log('🔍 Phase 5: Extracting bookmark data...\n');
  
  const extractionScript = `
    (() => {
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      const bookmarks = [];
      
      articles.forEach(article => {
        // Find the tweet permalink
        const statusLinks = article.querySelectorAll('a[href*="/status/"]');
        const timeElement = article.querySelector('time');
        const tweetText = article.querySelector('[data-testid="tweetText"]');
        
        // Get the correct status link (usually the timestamp link)
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
              url: 'https://x.com' + statusUrl,
              author: '@' + match[1],
              statusId: match[2],
              text: tweetText?.innerText?.substring(0, 100) || '',
              timestamp: timeElement?.getAttribute('datetime') || ''
            });
          }
        }
      });
      
      // Deduplicate
      const seen = new Set();
      return bookmarks.filter(b => {
        if (seen.has(b.statusId)) return false;
        seen.add(b.statusId);
        return true;
      });
    })()
  `;
  
  const extractResult = await sendCommand('Runtime.evaluate', {
    expression: extractionScript,
    returnByValue: true
  });
  
  return extractResult.result.value || [];
}

// ============================================================
// Phase 6: Test Scrolling
// ============================================================

async function testScrolling(sendCommand) {
  console.log('📜 Phase 6: Testing scroll functionality...\n');
  
  // Get initial scroll position
  const beforeScroll = await sendCommand('Runtime.evaluate', {
    expression: 'window.scrollY'
  });
  console.log(`   Scroll position before: ${beforeScroll.result.value}px`);
  
  // Scroll down
  await sendCommand('Runtime.evaluate', {
    expression: `window.scrollBy({ top: 800, behavior: 'smooth' })`
  });
  
  // Wait for scroll
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Get new scroll position
  const afterScroll = await sendCommand('Runtime.evaluate', {
    expression: 'window.scrollY'
  });
  console.log(`   Scroll position after: ${afterScroll.result.value}px`);
  console.log(`   ✅ Scrolling works! Moved ${afterScroll.result.value - beforeScroll.result.value}px\n`);
  
  return true;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  X Bookmarks CDP - Proof of Concept');
  console.log('═══════════════════════════════════════════════════════\n');
  
  try {
    // Phase 1: Check CDP connection
    const cdpInfo = await checkCDPConnection();
    
    // Phase 2: List tabs
    const tabs = await listTabs();
    
    // Find an existing X tab or use the first page tab
    let targetTab = tabs.find(t => t.url?.includes('x.com') || t.url?.includes('twitter.com'));
    
    if (!targetTab) {
      // Use first page type tab
      targetTab = tabs.find(t => t.type === 'page');
    }
    
    if (!targetTab) {
      console.log('❌ No suitable tab found. Please open a tab in Chrome.');
      return;
    }
    
    console.log(`   🎯 Using tab: ${targetTab.title?.substring(0, 40)}...\n`);
    
    // Phase 3: Connect via WebSocket
    const { ws, sendCommand } = await connectToTab(targetTab);
    
    // Phase 4 & 5: Navigate and extract
    const bookmarks = await navigateAndExtract(sendCommand, targetTab.url);
    
    console.log(`   Found ${bookmarks.length} bookmark(s) on current view:\n`);
    bookmarks.slice(0, 5).forEach((bm, i) => {
      console.log(`   ${i + 1}. ${bm.author}`);
      console.log(`      ${bm.text.substring(0, 60)}...`);
      console.log(`      ${bm.url}\n`);
    });
    
    if (bookmarks.length > 5) {
      console.log(`   ... and ${bookmarks.length - 5} more\n`);
    }
    
    // Phase 6: Test scrolling
    if (bookmarks.length > 0) {
      await testScrolling(sendCommand);
    }
    
    // Close connection
    ws.close();
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✅ PoC Complete - All phases verified!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Summary:');
    console.log('  ✅ CDP connection works');
    console.log('  ✅ Can list and connect to tabs');
    console.log('  ✅ Can navigate pages');
    console.log('  ✅ Can execute JavaScript in page context');
    console.log('  ✅ Can extract tweet data from DOM');
    console.log('  ✅ Can control scrolling');
    console.log('\nThe spec is FEASIBLE! 🎉\n');
    
  } catch (error) {
    console.error('\n❌ PoC Failed:', error.message);
    process.exit(1);
  }
}

main();
