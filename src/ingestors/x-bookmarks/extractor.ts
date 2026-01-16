/**
 * X Bookmarks Extractor
 *
 * Phase 2: Open individual tweet URLs and extract full content.
 * Required because feed view truncates tweet text (~63% content loss).
 *
 * Following functional patterns - pure functions, no classes.
 */

import type { CDPSession } from '../common/cdp-client.js';
import { navigateTo, evaluate, sleepWithJitter } from '../common/cdp-client.js';
import type { IngestItem, Seed } from '../types.js';
import type { TweetContent, XRateLimitConfig } from './types.js';
import { DEFAULT_X_RATE_LIMIT } from './types.js';
import { detectThread } from './thread-detector.js';

// ============================================================================
// Content Extraction Script
// ============================================================================

/**
 * JavaScript to extract tweet metadata from page.
 * Thread content is extracted separately by thread-detector.
 */
const EXTRACT_TWEET_METADATA_SCRIPT = `
(() => {
  const mainTweet = document.querySelector('article[data-testid="tweet"]');
  if (!mainTweet) {
    return null;
  }

  // Get author info
  const authorLink = mainTweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
  const authorHandle = authorLink?.getAttribute('href')?.replace('/', '') || '';
  const authorName = mainTweet.querySelector('[data-testid="User-Name"]')?.textContent?.split('@')[0]?.trim() || '';

  // Get tweet text
  const tweetText = mainTweet.querySelector('[data-testid="tweetText"]')?.innerText || '';

  // Get timestamp
  const timeEl = mainTweet.querySelector('time');
  const timestamp = timeEl?.getAttribute('datetime') || '';

  return {
    author: '@' + authorHandle,
    authorName,
    text: tweetText,
    timestamp
  };
})()
`;

// ============================================================================
// Types
// ============================================================================

interface TweetMetadata {
    readonly author: string;
    readonly authorName: string;
    readonly text: string;
    readonly timestamp: string;
}

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Extract full content from a single tweet URL.
 * Opens the tweet in the browser and extracts content + thread detection.
 */
export const extractTweetContent = async (
    session: CDPSession,
    item: IngestItem,
    config: XRateLimitConfig = DEFAULT_X_RATE_LIMIT
): Promise<TweetContent> => {
    // Navigate to tweet
    await navigateTo(session, item.url, config.pageLoadWaitMs);

    // Extract metadata
    const metadata = await evaluate<TweetMetadata | null>(session, EXTRACT_TWEET_METADATA_SCRIPT);

    if (!metadata) {
        throw new Error(`Failed to extract tweet content from ${item.url}`);
    }

    // Detect thread and extract all parts
    const { info: threadInfo, parts: threadParts, hasImages } = await detectThread(session);

    const now = new Date().toISOString();

    return {
        url: item.url,
        author: metadata.author,
        authorName: metadata.authorName,
        text: metadata.text,
        timestamp: metadata.timestamp,
        thread: threadInfo,
        threadParts,
        hasImages,
        extractedAt: now,
    };
};

/**
 * Convert TweetContent to a normalized Seed.
 */
export const tweetContentToSeed = (content: TweetContent): Seed => {
    // Use thread parts if available, otherwise use main text
    const contentArray =
        content.thread.isThread && content.threadParts.length > 0
            ? content.threadParts
            : [content.text];

    return {
        source: 'x-bookmarks',
        sourceId: extractStatusIdFromUrl(content.url),
        url: content.url,
        author: content.author,
        content: contentArray,
        isThread: content.thread.isThread,
        hasImages: content.hasImages,
        extractedAt: content.extractedAt,
        metadata: {
            authorName: content.authorName,
            timestamp: content.timestamp,
            threadConfidence: content.thread.confidence,
            threadMethod: content.thread.detectionMethod,
            threadParts: content.thread.estimatedParts,
        },
    };
};

/**
 * Extract full content and convert to Seed in one step.
 */
export const extractAndConvertToSeed = async (
    session: CDPSession,
    item: IngestItem,
    config: XRateLimitConfig = DEFAULT_X_RATE_LIMIT
): Promise<Seed> => {
    const content = await extractTweetContent(session, item, config);
    return tweetContentToSeed(content);
};

/**
 * Process multiple items with rate limiting between each.
 * Yields seeds as they are extracted for streaming processing.
 */
export async function* extractMultiple(
    session: CDPSession,
    items: readonly IngestItem[],
    config: XRateLimitConfig = DEFAULT_X_RATE_LIMIT,
    onProgress?: (current: number, total: number, item: IngestItem) => void
): AsyncGenerator<
    { readonly success: true; readonly seed: Seed } | { readonly success: false; readonly error: string; readonly item: IngestItem }
> {
    const itemCount = items.length;
    let index = 0;

    for (const item of items) {
        index++;

        if (onProgress) {
            onProgress(index, itemCount, item);
        }

        try {
            const seed = await extractAndConvertToSeed(session, item, config);
            yield { success: true, seed };
        } catch (error) {
            yield {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                item,
            };
        }

        // Rate limit delay between tweets (except for last one)
        if (index < itemCount) {
            await sleepWithJitter(config.betweenTweetsDelayMs, config.betweenTweetsJitterMs);
        }
    }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Extract status ID from tweet URL.
 */
const extractStatusIdFromUrl = (url: string): string => {
    const match = url.match(/\/status\/(\d+)/);
    if (!match || !match[1]) {
        throw new Error(`Invalid tweet URL: ${url}`);
    }
    return match[1];
};
