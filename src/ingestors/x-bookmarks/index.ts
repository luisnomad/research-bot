/**
 * X Bookmarks Ingestor Adapter
 *
 * Main adapter implementing IngestorAdapter interface.
 * Orchestrates the two-phase extraction process:
 * 1. Collect URLs from bookmark feed (collector.ts)
 * 2. Extract full content from each URL (extractor.ts)
 *
 * Following functional patterns - factory function returns adapter object.
 */

import type { CDPSession } from '../common/cdp-client.js';
import {
    checkCDPConnection,
    findOrGetFirstTab,
    connectToTab,
    DEFAULT_CDP_CONFIG,
    type CDPConfig,
} from '../common/cdp-client.js';
import type { IngestorAdapter, IngestItem, Seed } from '../types.js';
import type { XRateLimitConfig, ProgressCallback } from './types.js';
import { DEFAULT_X_RATE_LIMIT } from './types.js';
import { collectBookmarks, formatDuration } from './collector.js';
import { extractAndConvertToSeed, extractMultiple } from './extractor.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for X Bookmarks adapter.
 */
export interface XBookmarksConfig {
    /** Bookmark folder URL to import from */
    readonly folderUrl: string;

    /** Rate limiting configuration */
    readonly rateLimit?: XRateLimitConfig;

    /** CDP configuration */
    readonly cdp?: CDPConfig;

    /** Callback for collection progress */
    readonly onCollectionProgress?: ProgressCallback;

    /** Callback for extraction progress */
    readonly onExtractionProgress?: (current: number, total: number, item: IngestItem) => void;

    /** Function to check if item is already processed */
    readonly isProcessedFn?: (sourceId: string) => Promise<boolean>;

    /** Function to mark item as processed */
    readonly markProcessedFn?: (sourceId: string) => Promise<void>;
}

/**
 * X Bookmarks adapter state.
 */
interface AdapterState {
    readonly session: CDPSession | null;
    readonly processedIds: Set<string>;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an X Bookmarks ingestor adapter.
 *
 * Note: This uses a closure to maintain session state.
 * The adapter must be used sequentially (not concurrent calls).
 */
export const createXBookmarksAdapter = (config: XBookmarksConfig): IngestorAdapter => {
    const rateLimit = config.rateLimit ?? DEFAULT_X_RATE_LIMIT;
    const cdpConfig = config.cdp ?? DEFAULT_CDP_CONFIG;

    // Mutable state (encapsulated in closure)
    let state: AdapterState = {
        session: null,
        processedIds: new Set<string>(),
    };

    /**
     * Ensure CDP session is connected.
     */
    const ensureSession = async (): Promise<CDPSession> => {
        if (state.session) {
            return state.session;
        }

        // Check CDP is available
        await checkCDPConnection(cdpConfig);

        // Find X tab or first available
        const tab = await findOrGetFirstTab(/x\.com|twitter\.com/, cdpConfig);

        // Connect to tab
        const session = await connectToTab(tab);
        state = { ...state, session };

        return session;
    };

    /**
     * Close CDP session.
     * Exposed for cleanup when adapter is no longer needed.
     */
    const close = (): void => {
        if (state.session) {
            state.session.close();
            state = { ...state, session: null };
        }
    };

    // ─────────────────────────────────────────────────────────
    // IngestorAdapter Implementation
    // ─────────────────────────────────────────────────────────

    const collectItems = async (): Promise<readonly IngestItem[]> => {
        const session = await ensureSession();

        const result = await collectBookmarks(
            session,
            config.folderUrl,
            rateLimit,
            config.onCollectionProgress
        );

        console.log(
            `Collected ${result.items.length} bookmarks in ${result.scrollCount} scrolls (${formatDuration(result.durationMs)})`
        );

        return result.items;
    };

    const extractContent = async (item: IngestItem): Promise<Seed> => {
        const session = await ensureSession();
        return extractAndConvertToSeed(session, item, rateLimit);
    };

    const markProcessed = async (sourceId: string): Promise<void> => {
        if (config.markProcessedFn) {
            await config.markProcessedFn(sourceId);
        }
        const newProcessedIds = new Set(Array.from(state.processedIds));
        newProcessedIds.add(sourceId);
        state = {
            ...state,
            processedIds: newProcessedIds,
        };
    };

    const isProcessed = async (sourceId: string): Promise<boolean> => {
        if (state.processedIds.has(sourceId)) {
            return true;
        }
        if (config.isProcessedFn) {
            return config.isProcessedFn(sourceId);
        }
        return false;
    };

    // Return the adapter object with close method
    return {
        name: 'X Bookmarks',
        source: 'x-bookmarks',
        collectItems,
        extractContent,
        markProcessed,
        isProcessed,
        close,
    };
};

// ============================================================================
// High-Level Orchestration Functions
// ============================================================================

/**
 * Run full import: collect + extract all items.
 * Returns seeds and summary statistics.
 */
export const runFullImport = async (
    config: XBookmarksConfig
): Promise<{
    readonly seeds: readonly Seed[];
    readonly stats: {
        readonly collected: number;
        readonly extracted: number;
        readonly skipped: number;
        readonly failed: number;
        readonly durationMs: number;
    };
}> => {
    const startTime = Date.now();
    const adapter = createXBookmarksAdapter(config);

    // Phase 1: Collect
    console.log('\n📚 Phase 1: Collecting bookmark URLs...\n');
    const items = await adapter.collectItems();

    // Filter out already processed
    const toProcess: IngestItem[] = [];
    let skipped = 0;

    for (const item of items) {
        const processed = await adapter.isProcessed(item.sourceId);
        if (processed) {
            skipped++;
        } else {
            toProcess.push(item);
        }
    }

    console.log(`\n📝 Phase 2: Extracting content from ${toProcess.length} items (${skipped} already processed)...\n`);

    // Phase 2: Extract
    const rateLimit = config.rateLimit ?? DEFAULT_X_RATE_LIMIT;

    // We need a session for extraction
    const cdpConfig = config.cdp ?? DEFAULT_CDP_CONFIG;
    await checkCDPConnection(cdpConfig);
    const tab = await findOrGetFirstTab(/x\.com|twitter\.com/, cdpConfig);
    const session = await connectToTab(tab);

    const seeds: Seed[] = [];
    let failed = 0;

    try {
        for await (const result of extractMultiple(session, toProcess, rateLimit, config.onExtractionProgress)) {
            if (result.success) {
                seeds.push(result.seed);
                await adapter.markProcessed(result.seed.sourceId);
            } else {
                failed++;
                const failedResult = result as { readonly success: false; readonly error: string; readonly item: IngestItem };
                console.error(`Failed to extract ${failedResult.item.url}: ${failedResult.error}`);
            }
        }
    } finally {
        session.close();
    }

    return {
        seeds,
        stats: {
            collected: items.length,
            extracted: seeds.length,
            skipped,
            failed,
            durationMs: Date.now() - startTime,
        },
    };
};

// ============================================================================
// Exports
// ============================================================================

// Re-export types and utilities
export * from './types.js';
export { collectBookmarks, formatDuration } from './collector.js';
export { extractTweetContent, tweetContentToSeed, extractMultiple } from './extractor.js';
export { detectThread, hasThreadMarkers } from './thread-detector.js';
