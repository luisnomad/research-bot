/**
 * Seed Database Operations
 *
 * CRUD operations for the seeds table (multi-source ingestion).
 * Following functional patterns - pure functions, no classes.
 */

import Database from 'better-sqlite3';
import type { Seed, IngestSource } from '../ingestors/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Triage status for seeds
 */
export type TriageStatus = 'pending' | 'evaluating' | 'approved' | 'archived' | 'rejected';

/**
 * Seed record from database (includes DB-specific fields)
 */
export interface SeedRecord extends Seed {
    readonly id: number;
    readonly createdAt: string;
    readonly triageStatus: TriageStatus;
    readonly triageReason?: string;
    readonly triageConfidence?: number;
    readonly triageDecidedBy?: string;
    readonly triageAt?: string;
    readonly triageTopics?: string[];
    readonly processedAt?: string;
    readonly markdownPath?: string;
    readonly retryCount: number;
    readonly lastError?: string;
}

/**
 * Raw database row for seeds table
 */
interface SeedRow {
    id: number;
    source: string;
    source_id: string;
    url: string;
    author: string | null;
    content: string;
    is_thread: number;
    has_images: number;
    extracted_at: string;
    created_at: string;
    metadata: string | null;
    triage_status: string;
    triage_reason: string | null;
    triage_confidence: number | null;
    triage_decided_by: string | null;
    triage_at: string | null;
    triage_topics: string | null;
    processed_at: string | null;
    markdown_path: string | null;
    retry_count: number;
    last_error: string | null;
}

// ============================================================================
// Insert Operations
// ============================================================================

/**
 * Insert a new seed into the database.
 * Returns the inserted seed record with ID.
 */
export const insertSeed = (db: Database.Database, seed: Seed): SeedRecord => {
    const now = new Date().toISOString();

    const stmt = db.prepare(`
    INSERT INTO seeds (
      source, source_id, url, author, content,
      is_thread, has_images, extracted_at, created_at, metadata,
      triage_status, retry_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    const result = stmt.run(
        seed.source,
        seed.sourceId,
        seed.url,
        seed.author ?? null,
        JSON.stringify(seed.content),
        seed.isThread ? 1 : 0,
        seed.hasImages ? 1 : 0,
        seed.extractedAt,
        now,
        seed.metadata ? JSON.stringify(seed.metadata) : null,
        'pending',
        0
    );

    return getSeedById(db, result.lastInsertRowid as number)!;
};

/**
 * Insert multiple seeds in a transaction.
 * Returns count of inserted seeds (skips duplicates).
 */
export const insertSeeds = (
    db: Database.Database,
    seeds: readonly Seed[]
): { inserted: number; skipped: number } => {
    const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO seeds (
      source, source_id, url, author, content,
      is_thread, has_images, extracted_at, created_at, metadata,
      triage_status, retry_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    let inserted = 0;
    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
        for (const seed of seeds) {
            const result = insertStmt.run(
                seed.source,
                seed.sourceId,
                seed.url,
                seed.author ?? null,
                JSON.stringify(seed.content),
                seed.isThread ? 1 : 0,
                seed.hasImages ? 1 : 0,
                seed.extractedAt,
                now,
                seed.metadata ? JSON.stringify(seed.metadata) : null,
                'pending',
                0
            );
            if (result.changes > 0) {
                inserted++;
            }
        }
    });

    transaction();

    return {
        inserted,
        skipped: seeds.length - inserted,
    };
};

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Get seed by ID
 */
export const getSeedById = (db: Database.Database, id: number): SeedRecord | undefined => {
    const stmt = db.prepare('SELECT * FROM seeds WHERE id = ?');
    const row = stmt.get(id) as SeedRow | undefined;
    return row ? mapRowToSeedRecord(row) : undefined;
};

/**
 * Get seed by source and source_id
 */
export const getSeedBySourceId = (
    db: Database.Database,
    source: IngestSource,
    sourceId: string
): SeedRecord | undefined => {
    const stmt = db.prepare('SELECT * FROM seeds WHERE source = ? AND source_id = ?');
    const row = stmt.get(source, sourceId) as SeedRow | undefined;
    return row ? mapRowToSeedRecord(row) : undefined;
};

/**
 * Check if a seed exists by source and source_id
 */
export const seedExists = (
    db: Database.Database,
    source: IngestSource,
    sourceId: string
): boolean => {
    const stmt = db.prepare('SELECT 1 FROM seeds WHERE source = ? AND source_id = ?');
    const result = stmt.get(source, sourceId);
    return result !== undefined;
};

/**
 * Get seeds by triage status
 */
export const getSeedsByTriageStatus = (
    db: Database.Database,
    status: TriageStatus,
    limit?: number
): readonly SeedRecord[] => {
    const query = limit
        ? 'SELECT * FROM seeds WHERE triage_status = ? ORDER BY created_at ASC LIMIT ?'
        : 'SELECT * FROM seeds WHERE triage_status = ? ORDER BY created_at ASC';

    const stmt = db.prepare(query);
    const rows = (limit ? stmt.all(status, limit) : stmt.all(status)) as SeedRow[];

    return rows.map(mapRowToSeedRecord);
};

/**
 * Get seeds by source
 */
export const getSeedsBySource = (
    db: Database.Database,
    source: IngestSource,
    limit?: number
): readonly SeedRecord[] => {
    const query = limit
        ? 'SELECT * FROM seeds WHERE source = ? ORDER BY created_at DESC LIMIT ?'
        : 'SELECT * FROM seeds WHERE source = ? ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    const rows = (limit ? stmt.all(source, limit) : stmt.all(source)) as SeedRow[];

    return rows.map(mapRowToSeedRecord);
};

/**
 * Get pending seeds for triage
 */
export const getPendingSeeds = (
    db: Database.Database,
    limit?: number
): readonly SeedRecord[] => {
    return getSeedsByTriageStatus(db, 'pending', limit);
};

/**
 * Search seeds by topic
 */
export const searchSeedsByTopic = (
    db: Database.Database,
    topic: string,
    limit?: number
): readonly SeedRecord[] => {
    const query = limit
        ? 'SELECT * FROM seeds WHERE triage_topics LIKE ? ORDER BY created_at DESC LIMIT ?'
        : 'SELECT * FROM seeds WHERE triage_topics LIKE ? ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    const searchTerm = `%${topic}%`;
    const rows = (limit ? stmt.all(searchTerm, limit) : stmt.all(searchTerm)) as SeedRow[];

    return rows.map(mapRowToSeedRecord);
};

// ============================================================================
// Update Operations
// ============================================================================

/**
 * Update triage status
 */
export const updateTriageStatus = (
    db: Database.Database,
    id: number,
    status: TriageStatus,
    reason?: string,
    confidence?: number,
    decidedBy?: string,
    topics?: string[]
): void => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
    UPDATE seeds
    SET triage_status = ?,
        triage_reason = ?,
        triage_confidence = ?,
        triage_decided_by = ?,
        triage_at = ?,
        triage_topics = ?
    WHERE id = ?
  `);

    stmt.run(
        status,
        reason ?? null,
        confidence ?? null,
        decidedBy ?? null,
        now,
        topics ? JSON.stringify(topics) : null,
        id
    );
};

/**
 * Mark seed as processed
 */
export const markSeedProcessed = (
    db: Database.Database,
    id: number,
    markdownPath: string
): void => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
    UPDATE seeds
    SET processed_at = ?,
        markdown_path = ?
    WHERE id = ?
  `);

    stmt.run(now, markdownPath, id);
};

/**
 * Increment retry count and log error
 */
export const incrementSeedRetry = (
    db: Database.Database,
    id: number,
    error: string
): void => {
    const stmt = db.prepare(`
    UPDATE seeds
    SET retry_count = retry_count + 1,
        last_error = ?
    WHERE id = ?
  `);

    stmt.run(error, id);
};

// ============================================================================
// Count Operations
// ============================================================================

/**
 * Count seeds by triage status
 */
export const countSeedsByTriageStatus = (
    db: Database.Database,
    status: TriageStatus
): number => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM seeds WHERE triage_status = ?');
    const result = stmt.get(status) as { count: number };
    return result.count;
};

/**
 * Count seeds by source
 */
export const countSeedsBySource = (db: Database.Database, source: IngestSource): number => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM seeds WHERE source = ?');
    const result = stmt.get(source) as { count: number };
    return result.count;
};

/**
 * Get total seed count
 */
export const getTotalSeedCount = (db: Database.Database): number => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM seeds');
    const result = stmt.get() as { count: number };
    return result.count;
};

/**
 * Get seed statistics
 */
export const getSeedStats = (
    db: Database.Database
): {
    total: number;
    pending: number;
    approved: number;
    archived: number;
    rejected: number;
    processed: number;
    bySource: Record<string, number>;
} => {
    const total = getTotalSeedCount(db);
    const pending = countSeedsByTriageStatus(db, 'pending');
    const approved = countSeedsByTriageStatus(db, 'approved');
    const archived = countSeedsByTriageStatus(db, 'archived');
    const rejected = countSeedsByTriageStatus(db, 'rejected');

    // Count processed (has markdown_path)
    const processedStmt = db.prepare(
        'SELECT COUNT(*) as count FROM seeds WHERE processed_at IS NOT NULL'
    );
    const processedResult = processedStmt.get() as { count: number };
    const processed = processedResult.count;

    // Count by source
    const sourceStmt = db.prepare(
        'SELECT source, COUNT(*) as count FROM seeds GROUP BY source'
    );
    const sourceRows = sourceStmt.all() as Array<{ source: string; count: number }>;
    const bySource: Record<string, number> = {};
    for (const row of sourceRows) {
        bySource[row.source] = row.count;
    }

    return {
        total,
        pending,
        approved,
        archived,
        rejected,
        processed,
        bySource,
    };
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map database row to SeedRecord
 */
const mapRowToSeedRecord = (row: SeedRow): SeedRecord => ({
    id: row.id,
    source: row.source as IngestSource,
    sourceId: row.source_id,
    url: row.url,
    author: row.author ?? undefined,
    content: JSON.parse(row.content) as readonly string[],
    isThread: row.is_thread === 1,
    hasImages: row.has_images === 1,
    extractedAt: row.extracted_at,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
    triageStatus: row.triage_status as TriageStatus,
    triageReason: row.triage_reason ?? undefined,
    triageConfidence: row.triage_confidence ?? undefined,
    triageDecidedBy: row.triage_decided_by ?? undefined,
    triageAt: row.triage_at ?? undefined,
    triageTopics: row.triage_topics ? JSON.parse(row.triage_topics) : undefined,
    processedAt: row.processed_at ?? undefined,
    markdownPath: row.markdown_path ?? undefined,
    retryCount: row.retry_count,
    lastError: row.last_error ?? undefined,
});
