/**
 * Markdown Generation Types
 *
 * Types for generating FOAM-compatible markdown files from triaged seeds.
 */

import { Seed } from '../ingestors/types.js';
import { TriageResult } from '../llm/triage.js';

/**
 * Markdown frontmatter metadata
 */
export interface MarkdownFrontmatter {
    /** Source adapter (e.g., 'x-bookmarks') */
    readonly source: string;

    /** Unique ID within source */
    readonly source_id: string;

    /** Author handle or name */
    readonly author?: string;

    /** Original URL */
    readonly url: string;

    /** ISO 8601 date when content was created */
    readonly created?: string;

    /** ISO 8601 date when content was triaged */
    readonly triaged?: string;

    /** Triage status */
    readonly status: 'approved' | 'archived' | 'rejected';

    /** Triage confidence (0-1) */
    readonly confidence: number;

    /** Topics extracted from triage */
    readonly topics?: readonly string[];

    /** Whether content is outdated */
    readonly outdated?: boolean;

    /** Whether content is misleading */
    readonly misleading?: boolean;

    /** Whether this is a thread */
    readonly is_thread?: boolean;

    /** Whether images are present */
    readonly has_images?: boolean;
}

/**
 * Complete markdown document
 */
export interface MarkdownDocument {
    /** Frontmatter metadata */
    readonly frontmatter: MarkdownFrontmatter;

    /** Main content body */
    readonly body: string;

    /** Suggested filename (without extension) */
    readonly filename: string;

    /** Target directory based on status */
    readonly directory: 'sources' | 'archive' | 'rejected';
}

/**
 * Input for markdown generation
 */
export interface MarkdownGenerationInput {
    /** The seed to generate markdown for */
    readonly seed: Seed;

    /** Triage result for this seed */
    readonly triageResult: TriageResult;

    /** When the seed was triaged */
    readonly triagedAt: string;

    /** Related seeds for cross-referencing */
    readonly relatedSeeds?: readonly {
        readonly title: string;
        readonly filename: string;
        readonly similarity: number;
    }[];
}
