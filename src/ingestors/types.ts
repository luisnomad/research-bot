/**
 * Ingestor Types
 *
 * Common types for all ingestion adapters.
 * Following functional patterns - types only, no classes.
 */

// ============================================================================
// Seed - The Universal Unit of Ingested Content
// ============================================================================

/**
 * Source identifier for ingested content
 */
export type IngestSource = 'x-bookmarks' | 'rss' | 'youtube' | 'github' | 'manual';

/**
 * Seed - Normalized representation of ingested content.
 * All ingestion sources produce seeds for triage.
 */
export interface Seed {
    /** Source adapter that produced this seed */
    readonly source: IngestSource;

    /** Unique identifier within the source (e.g., tweet status ID, raindrop ID) */
    readonly sourceId: string;

    /** Original URL */
    readonly url: string;

    /** Author handle or name */
    readonly author?: string;

    /**
     * Content array - for threads, each part is a separate entry.
     * For single items, this is a single-element array.
     */
    readonly content: readonly string[];

    /** Whether this is a multi-part thread */
    readonly isThread: boolean;

    /** Whether images are present (flagged only, not processed) */
    readonly hasImages: boolean;

    /** ISO 8601 timestamp when content was extracted */
    readonly extractedAt: string;

    /** Source-specific metadata */
    readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// Ingest Item - Raw item before full extraction
// ============================================================================

/**
 * IngestItem - Lightweight reference collected during feed scanning.
 * Used in Phase 1 (URL collection) before full content extraction.
 */
export interface IngestItem {
    /** Unique identifier within the source */
    readonly sourceId: string;

    /** URL to the content */
    readonly url: string;

    /** Author handle (if available from feed preview) */
    readonly author?: string;

    /** Preview text (may be truncated) */
    readonly previewText?: string;

    /** When this item was collected */
    readonly collectedAt: string;
}

// ============================================================================
// Ingestor Adapter Interface
// ============================================================================

/**
 * IngestorAdapter - Contract for all ingestion sources.
 *
 * Each adapter implements three phases:
 * 1. collectItems - Gather item references (URLs, IDs) from the source
 * 2. extractContent - Get full content for a single item
 * 3. markProcessed - Track what's been processed to avoid duplicates
 */
export interface IngestorAdapter {
    /** Human-readable name of this adapter */
    readonly name: string;

    /** Source identifier */
    readonly source: IngestSource;

    /**
     * Phase 1: Collect item references from the source.
     * Returns lightweight items (URLs/IDs) without full content.
     */
    readonly collectItems: () => Promise<readonly IngestItem[]>;

    /**
     * Phase 2: Extract full content for a single item.
     * Returns a normalized Seed ready for triage.
     */
    readonly extractContent: (item: IngestItem) => Promise<Seed>;

    /**
     * Mark an item as processed to prevent future reprocessing.
     */
    readonly markProcessed: (sourceId: string) => Promise<void>;

    /**
     * Check if an item has already been processed.
     */
    readonly isProcessed: (sourceId: string) => Promise<boolean>;

    /**
     * Optional cleanup method to release resources (e.g., close connections).
     */
    readonly close?: () => void;
}

// ============================================================================
// Extraction State - For Resume Capability
// ============================================================================

/**
 * ExtractionState - Tracks progress for resumable operations.
 */
export interface ExtractionState {
    /** Source being extracted */
    readonly source: IngestSource;

    /** Last successful scroll/page position */
    readonly lastPosition: number;

    /** Last successfully processed item ID */
    readonly lastProcessedId?: string;

    /** Total items found so far */
    readonly totalFound: number;

    /** Total items processed */
    readonly totalProcessed: number;

    /** ISO 8601 timestamp of last update */
    readonly updatedAt: string;

    /** Whether extraction is complete */
    readonly isComplete: boolean;
}

// ============================================================================
// Collection Result
// ============================================================================

/**
 * CollectionResult - Result of Phase 1 collection.
 */
export interface CollectionResult {
    /** Items collected */
    readonly items: readonly IngestItem[];

    /** Number of scrolls/pages processed */
    readonly scrollCount: number;

    /** Total time taken in milliseconds */
    readonly durationMs: number;

    /** Whether more items may be available */
    readonly hasMore: boolean;

    /** Any warnings or notes */
    readonly warnings?: readonly string[];
}

// ============================================================================
// Extraction Result
// ============================================================================

/**
 * ExtractionResult - Result of Phase 2 extraction for a single item.
 */
export type ExtractionResult =
    | { readonly success: true; readonly seed: Seed }
    | { readonly success: false; readonly error: string; readonly retryable: boolean };
