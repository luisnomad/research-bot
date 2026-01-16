/**
 * SQLite database schema and initialization
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Database schema version
 */
export const SCHEMA_VERSION = 2;

/**
 * Create database schema
 */
export const createSchema = (db: Database.Database): void => {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // ============================================================================
  // Seeds Table (Multi-source Ingestion)
  // ============================================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS seeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      -- Source identification
      source TEXT NOT NULL,              -- 'x-bookmarks', 'raindrop', 'rss', etc.
      source_id TEXT NOT NULL,           -- Unique ID within source (e.g., tweet status ID)
      url TEXT NOT NULL,
      
      -- Content
      author TEXT,
      content TEXT NOT NULL,             -- JSON array of content parts (for threads)
      is_thread INTEGER NOT NULL DEFAULT 0,
      has_images INTEGER NOT NULL DEFAULT 0,
      
      -- Timestamps
      extracted_at TEXT NOT NULL,        -- ISO 8601: when content was extracted
      created_at TEXT NOT NULL,          -- ISO 8601: when record was created
      
      -- Source-specific metadata
      metadata TEXT,                     -- JSON object
      
      -- Triage status
      triage_status TEXT NOT NULL DEFAULT 'pending',  -- pending, evaluating, approved, archived, rejected
      triage_reason TEXT,
      triage_confidence REAL,
      triage_decided_by TEXT,
      triage_at TEXT,                    -- ISO 8601
      triage_topics TEXT,                -- JSON array
      
      -- Processing status
      processed_at TEXT,                 -- ISO 8601
      markdown_path TEXT,
      
      -- Error tracking
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      
      -- Constraints
      UNIQUE(source, source_id),
      CHECK (triage_confidence IS NULL OR (triage_confidence >= 0 AND triage_confidence <= 1))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_seeds_source
      ON seeds(source);

    CREATE INDEX IF NOT EXISTS idx_seeds_source_id
      ON seeds(source, source_id);

    CREATE INDEX IF NOT EXISTS idx_seeds_triage_status
      ON seeds(triage_status);

    CREATE INDEX IF NOT EXISTS idx_seeds_created_at
      ON seeds(created_at);

    CREATE INDEX IF NOT EXISTS idx_seeds_url
      ON seeds(url);
  `);

  // ============================================================================
  // Processing Log Table
  // ============================================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS processing_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      action TEXT NOT NULL,              -- 'collected', 'extracted', 'triaged', 'processed', 'error'
      details TEXT,                      -- JSON object with action-specific details
      created_at TEXT NOT NULL           -- ISO 8601
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_processing_log_source
      ON processing_log(source, source_id);

    CREATE INDEX IF NOT EXISTS idx_processing_log_action
      ON processing_log(action);

    CREATE INDEX IF NOT EXISTS idx_processing_log_created_at
      ON processing_log(created_at);
  `);

  // ============================================================================
  // Extraction State Table (Resume Capability)
  // ============================================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS extraction_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL UNIQUE,       -- One state per source
      last_position INTEGER NOT NULL DEFAULT 0,
      last_processed_id TEXT,
      total_found INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      is_complete INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL           -- ISO 8601
    );
  `);

  // ============================================================================
  // Schema Version Tracking
  // ============================================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  // Insert initial version if not exists
  const versionExists = db
    .prepare('SELECT COUNT(*) as count FROM schema_version WHERE version = ?')
    .get(SCHEMA_VERSION) as { count: number };

  if (versionExists.count === 0) {
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      SCHEMA_VERSION,
      new Date().toISOString()
    );
  }
};

/**
 * Initialize database connection
 */
export const initDatabase = (dbPath?: string): Database.Database => {
  const path = dbPath ?? process.env['DATABASE_PATH'] ?? './.system/bookmarks.db';
  const dir = join(path, '..');

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Open database
  const db = new Database(path);

  // Create schema
  createSchema(db);

  return db;
};

/**
 * Close database connection
 */
export const closeDatabase = (db: Database.Database): void => {
  db.close();
};

/**
 * Get current schema version
 */
export const getSchemaVersion = (db: Database.Database): number => {
  const result = db
    .prepare('SELECT MAX(version) as version FROM schema_version')
    .get() as { version: number | null };

  return result.version ?? 0;
};

/**
 * Run database migrations
 * Add migration logic here as schema evolves
 */
export const runMigrations = (db: Database.Database): void => {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion < SCHEMA_VERSION) {
    // Future migrations will go here
    // Example:
    // if (currentVersion < 2) {
    //   db.exec('ALTER TABLE bookmarks ADD COLUMN new_field TEXT');
    //   db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
    //     2,
    //     new Date().toISOString()
    //   );
    // }
  }
};
