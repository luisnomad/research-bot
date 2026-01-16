/**
 * Ingestors Module
 *
 * Central registry and exports for all ingestion adapters.
 */

// Core types
export * from './types.js';

// Common utilities
export * from './common/cdp-client.js';

// Adapters
export * from './x-bookmarks/index.js';

// Future adapters:
// export * from './raindrop/index.js';
