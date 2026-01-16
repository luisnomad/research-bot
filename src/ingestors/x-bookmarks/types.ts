/**
 * X Bookmarks Types
 *
 * Types specific to X (Twitter) bookmark extraction.
 */

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

/**
 * Rate limiting configuration for X bookmarks extraction.
 * Conservative timing to respect platform limits.
 */
export interface XRateLimitConfig {
    /** Base delay between scrolls (ms) */
    readonly scrollDelayMs: number;

    /** Random jitter added to scroll delay (0 to this value) */
    readonly scrollJitterMs: number;

    /** Scroll amount in pixels per iteration */
    readonly scrollAmountPx: number;

    /** Stop after this many scrolls with no new items */
    readonly maxNoNewItems: number;

    /** Safety limit - max total scrolls */
    readonly maxTotalScrolls: number;

    /** Wait time after page navigation (ms) */
    readonly pageLoadWaitMs: number;

    /** Delay between opening individual tweets (ms) */
    readonly betweenTweetsDelayMs: number;

    /** Jitter added to between-tweets delay (ms) */
    readonly betweenTweetsJitterMs: number;
}

/**
 * Default rate limiting configuration.
 * Based on PoC validation results.
 */
export const DEFAULT_X_RATE_LIMIT: XRateLimitConfig = {
    scrollDelayMs: 2500,
    scrollJitterMs: 1000,
    scrollAmountPx: 600,
    maxNoNewItems: 5,
    maxTotalScrolls: 100,
    pageLoadWaitMs: 5000,
    betweenTweetsDelayMs: 5000,
    betweenTweetsJitterMs: 3000,
};

// ============================================================================
// Tweet Data Types
// ============================================================================

/**
 * Raw tweet data extracted from DOM.
 */
export interface RawTweetData {
    /** Tweet status ID */
    readonly statusId: string;

    /** Full URL to tweet */
    readonly url: string;

    /** Author handle (with @) */
    readonly author: string;

    /** Tweet text (may be truncated in feed view) */
    readonly text: string;

    /** ISO 8601 timestamp */
    readonly timestamp: string;
}

/**
 * Thread detection result.
 */
export interface ThreadInfo {
    /** Whether this is detected as a thread */
    readonly isThread: boolean;

    /** Confidence score (0-1) */
    readonly confidence: number;

    /** How the thread was detected */
    readonly detectionMethod: string;

    /** Estimated number of thread parts */
    readonly estimatedParts: number;
}

/**
 * Full tweet content extracted from direct view.
 */
export interface TweetContent {
    /** Tweet URL */
    readonly url: string;

    /** Author handle */
    readonly author: string;

    /** Author display name */
    readonly authorName: string;

    /** Full tweet text (not truncated) */
    readonly text: string;

    /** Tweet timestamp */
    readonly timestamp: string;

    /** Thread information */
    readonly thread: ThreadInfo;

    /** Array of thread part texts (if thread) */
    readonly threadParts: readonly string[];

    /** Whether images are present */
    readonly hasImages: boolean;

    /** When content was extracted */
    readonly extractedAt: string;
}

// ============================================================================
// Collection Progress
// ============================================================================

/**
 * Progress update during collection.
 */
export interface CollectionProgress {
    /** Current scroll number */
    readonly scrollNumber: number;

    /** Total unique bookmarks found so far */
    readonly totalFound: number;

    /** New items found in this scroll */
    readonly newItemsFound: number;

    /** Elapsed time in milliseconds */
    readonly elapsedMs: number;

    /** Consecutive scrolls with no new items */
    readonly noNewItemsCount: number;
}

/**
 * Progress callback type.
 */
export type ProgressCallback = (progress: CollectionProgress) => void;
