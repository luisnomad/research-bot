/**
 * X Thread Detector
 *
 * Detects multi-part threads from tweet pages.
 * Key insight: Only count CONSECUTIVE same-author tweets as thread parts.
 *
 * Following functional patterns - pure functions, no classes.
 */

import type { CDPSession } from '../common/cdp-client.js';
import { evaluate } from '../common/cdp-client.js';
import type { ThreadInfo } from './types.js';

// ============================================================================
// Thread Detection Script (runs in page context)
// ============================================================================

/**
 * JavaScript to detect threads and extract thread parts.
 * Counts only consecutive same-author tweets (not later replies in comments).
 */
const THREAD_DETECTION_SCRIPT = `
(() => {
  const allTweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  if (allTweets.length === 0) {
    return { isThread: false, confidence: 0, method: 'no_tweets', parts: 0, threadParts: [] };
  }

  const mainTweet = allTweets[0];
  const indicators = [];

  // Helper to get author handle from tweet
  const getAuthor = (tweet) => {
    const link = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
    return link?.getAttribute('href')?.replace('/', '') || null;
  };

  // Helper to check for images
  const hasImages = (tweet) => {
    return tweet.querySelector('[data-testid="tweetPhoto"]') !== null ||
           tweet.querySelector('img[src*="media"]') !== null;
  };

  // Get main tweet author
  const mainAuthor = getAuthor(mainTweet);
  const mainText = mainTweet.querySelector('[data-testid="tweetText"]')?.innerText || '';

  // ─────────────────────────────────────────────────────────
  // INDICATOR 1: Content Patterns (high confidence)
  // ─────────────────────────────────────────────────────────

  // Numbered thread pattern: "1/", "(1/5)", "1/n", "🧵 1/"
  if (/[\\(]?1\\s*\\/\\s*[\\d\\w\\)]?/.test(mainText)) {
    indicators.push({ method: 'numbered_start', confidence: 0.90 });
  }

  // Explicit thread markers
  const threadMarkers = ['thread:', '🧵', 'a thread', 'thread 👇', '/thread'];
  if (threadMarkers.some(m => mainText.toLowerCase().includes(m))) {
    indicators.push({ method: 'explicit_marker', confidence: 0.85 });
  }

  // ─────────────────────────────────────────────────────────
  // INDICATOR 2: UI Elements (high confidence)
  // ─────────────────────────────────────────────────────────

  const showThreadBtn = document.querySelector('[aria-label*="Show this thread"]');
  if (showThreadBtn) {
    indicators.push({ method: 'ui_show_thread', confidence: 0.95 });
  }

  // Thread connector lines between tweets
  const threadLine = mainTweet.parentElement?.querySelector('[style*="border-left"]');
  if (threadLine) {
    indicators.push({ method: 'thread_connector', confidence: 0.85 });
  }

  // ─────────────────────────────────────────────────────────
  // Count consecutive same-author tweets (THE KEY INSIGHT)
  // ─────────────────────────────────────────────────────────

  const threadParts = [];
  let consecutiveCount = 0;

  for (let i = 0; i < allTweets.length; i++) {
    const tweet = allTweets[i];
    const author = getAuthor(tweet);

    if (author === mainAuthor) {
      consecutiveCount++;
      const tweetText = tweet.querySelector('[data-testid="tweetText"]')?.innerText || '';
      if (tweetText) {
        threadParts.push(tweetText);
      }
    } else {
      // Different author = end of thread
      // Only break if we've found at least one tweet from main author
      if (consecutiveCount > 0) {
        break;
      }
    }
  }

  // Multiple consecutive tweets from same author = thread
  if (consecutiveCount > 1) {
    indicators.push({ method: 'consecutive_same_author', confidence: 0.75 });
  }

  // ─────────────────────────────────────────────────────────
  // Aggregate Results
  // ─────────────────────────────────────────────────────────

  if (indicators.length === 0) {
    return {
      isThread: false,
      confidence: 0,
      method: 'none',
      parts: 1,
      threadParts: [mainText],
      hasImages: hasImages(mainTweet)
    };
  }

  // Use highest confidence indicator
  const best = indicators.reduce((a, b) => a.confidence > b.confidence ? a : b);

  // Boost confidence if multiple indicators agree
  let finalConfidence = best.confidence;
  if (indicators.length >= 2) finalConfidence = Math.min(finalConfidence + 0.10, 1.0);
  if (indicators.length >= 3) finalConfidence = Math.min(finalConfidence + 0.05, 1.0);

  return {
    isThread: finalConfidence >= 0.60 || consecutiveCount > 1,
    confidence: finalConfidence,
    method: best.method,
    parts: consecutiveCount,
    threadParts: threadParts,
    hasImages: allTweets.some(t => hasImages(t))
  };
})()
`;

// ============================================================================
// Thread Detection Result Type (from JS execution)
// ============================================================================

interface ThreadDetectionResult {
    readonly isThread: boolean;
    readonly confidence: number;
    readonly method: string;
    readonly parts: number;
    readonly threadParts: readonly string[];
    readonly hasImages: boolean;
}

// ============================================================================
// Public Functions
// ============================================================================

/**
 * Detect thread and extract all thread parts from a tweet page.
 *
 * Must be called after navigating to the direct tweet URL (not feed view).
 */
export const detectThread = async (
    session: CDPSession
): Promise<{
    readonly info: ThreadInfo;
    readonly parts: readonly string[];
    readonly hasImages: boolean;
}> => {
    const result = await evaluate<ThreadDetectionResult>(session, THREAD_DETECTION_SCRIPT);

    const info: ThreadInfo = {
        isThread: result.isThread,
        confidence: result.confidence,
        detectionMethod: result.method,
        estimatedParts: result.parts,
    };

    return {
        info,
        parts: result.threadParts,
        hasImages: result.hasImages,
    };
};

/**
 * Check if text likely contains thread markers.
 * Quick check without full page detection.
 */
export const hasThreadMarkers = (text: string): boolean => {
    const lowerText = text.toLowerCase();

    // Numbered pattern
    if (/[\(]?1\s*\/\s*[\d\w\)]?/.test(text)) {
        return true;
    }

    // Explicit markers
    const markers = ['thread:', '🧵', 'a thread', 'thread 👇', '/thread'];
    return markers.some((marker) => lowerText.includes(marker));
};
