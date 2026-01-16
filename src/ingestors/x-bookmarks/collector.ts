/**
 * X Bookmarks Collector
 *
 * Phase 1: Scroll through bookmark feed and collect tweet URLs.
 * Does NOT extract full content (feed view truncates).
 *
 * Following functional patterns - pure functions, no classes.
 */

import type { CDPSession } from '../common/cdp-client.js';
import {
    evaluate,
    scrollBy,
    sleepWithJitter,
    navigateTo,
    getCurrentUrl,
} from '../common/cdp-client.js';
import type { IngestItem } from '../types.js';
import type { RawTweetData, XRateLimitConfig, ProgressCallback, CollectionProgress } from './types.js';
import { DEFAULT_X_RATE_LIMIT } from './types.js';

// ============================================================================
// DOM Extraction Script
// ============================================================================

/**
 * JavaScript to execute in page context for extracting visible bookmarks.
 * Returns deduplicated array of tweet data.
 */
const EXTRACT_BOOKMARKS_SCRIPT = `
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
      // Match only the main tweet URL (not reply context links)
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
          text: tweetText?.innerText?.substring(0, 100) || '',
          url: 'https://x.com' + statusUrl,
          timestamp: timeElement?.getAttribute('datetime') || ''
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

// ============================================================================
// Collection Functions
// ============================================================================

/**
 * Extract currently visible bookmarks from the page.
 */
export const extractVisibleBookmarks = async (
    session: CDPSession
): Promise<readonly RawTweetData[]> => {
    const result = await evaluate<RawTweetData[]>(session, EXTRACT_BOOKMARKS_SCRIPT);
    return result ?? [];
};

/**
 * Navigate to a bookmarks folder URL.
 */
export const navigateToBookmarks = async (
    session: CDPSession,
    folderUrl: string,
    config: XRateLimitConfig = DEFAULT_X_RATE_LIMIT
): Promise<void> => {
    await navigateTo(session, folderUrl, config.pageLoadWaitMs);

    // Verify we're on the right page
    const currentUrl = await getCurrentUrl(session);
    if (!currentUrl.includes('/bookmarks')) {
        throw new Error(`Failed to navigate to bookmarks. Current URL: ${currentUrl}`);
    }
};

/**
 * Collect all bookmarks from a folder by scrolling.
 *
 * Returns IngestItems (lightweight references) suitable for Phase 2 extraction.
 */
export const collectBookmarks = async (
    session: CDPSession,
    folderUrl: string,
    config: XRateLimitConfig = DEFAULT_X_RATE_LIMIT,
    onProgress?: ProgressCallback
): Promise<{
    readonly items: readonly IngestItem[];
    readonly scrollCount: number;
    readonly durationMs: number;
}> => {
    const startTime = Date.now();
    const allBookmarks = new Map<string, RawTweetData>();
    let noNewItemsCount = 0;
    let scrollCount = 0;

    // Navigate to bookmarks folder
    await navigateToBookmarks(session, folderUrl, config);

    // Scroll and collect
    while (scrollCount < config.maxTotalScrolls) {
        // Extract visible bookmarks
        const visible = await extractVisibleBookmarks(session);
        let newItemsFound = 0;

        // Add new bookmarks to collection
        for (const bookmark of visible) {
            if (!allBookmarks.has(bookmark.statusId)) {
                allBookmarks.set(bookmark.statusId, bookmark);
                newItemsFound++;
            }
        }

        // Report progress
        if (onProgress) {
            const progress: CollectionProgress = {
                scrollNumber: scrollCount + 1,
                totalFound: allBookmarks.size,
                newItemsFound,
                elapsedMs: Date.now() - startTime,
                noNewItemsCount,
            };
            onProgress(progress);
        }

        // Check if we've reached the end
        if (newItemsFound === 0) {
            noNewItemsCount++;
            if (noNewItemsCount >= config.maxNoNewItems) {
                break;
            }
        } else {
            noNewItemsCount = 0;
        }

        // Scroll down
        await scrollBy(session, config.scrollAmountPx);

        // Rate-limit friendly delay with jitter
        await sleepWithJitter(config.scrollDelayMs, config.scrollJitterMs);

        scrollCount++;
    }

    // Convert to IngestItems
    const now = new Date().toISOString();
    const items: readonly IngestItem[] = Array.from(allBookmarks.values()).map((tweet) => ({
        sourceId: tweet.statusId,
        url: tweet.url,
        author: tweet.author,
        previewText: tweet.text,
        collectedAt: now,
    }));

    return {
        items,
        scrollCount,
        durationMs: Date.now() - startTime,
    };
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract status ID from a tweet URL.
 */
export const extractStatusId = (url: string): string | null => {
    const match = url.match(/\/status\/(\d+)/);
    return match?.[1] ?? null;
};

/**
 * Format duration in human-readable form.
 */
export const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
};
