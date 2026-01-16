/**
 * Database operations tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { createSchema } from '../../src/db/schema.js';
import {
  insertBookmark,
  getBookmarkById,
  getBookmarkByRaindropId,
  updateBookmarkStatus,
  getTotalCount,
  countByStatus,
} from '../../src/db/operations.js';
import type { CreateBookmarkInput } from '../../src/types/index.js';

describe('Database Operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    createSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('insertBookmark', () => {
    it('should insert a new bookmark', () => {
      const input: CreateBookmarkInput = {
        raindrop_id: 12345,
        url: 'https://example.com/article',
        title: 'Test Article',
        description: 'Test description',
        tags: ['test', 'article'],
        created_at: new Date('2026-01-13'),
      };

      const bookmark = insertBookmark(db, input);

      expect(bookmark.id).toBeDefined();
      expect(bookmark.raindrop_id).toBe(12345);
      expect(bookmark.url).toBe('https://example.com/article');
      expect(bookmark.title).toBe('Test Article');
      expect(bookmark.status).toBe('triage_pending');
      expect(bookmark.tags).toEqual(['test', 'article']);
    });

    it('should handle bookmarks without description', () => {
      const input: CreateBookmarkInput = {
        raindrop_id: 12346,
        url: 'https://example.com/article2',
        title: 'Test Article 2',
        tags: ['test'],
        created_at: new Date('2026-01-13'),
      };

      const bookmark = insertBookmark(db, input);

      expect(bookmark.description).toBeUndefined();
    });
  });

  describe('getBookmarkById', () => {
    it('should retrieve bookmark by id', () => {
      const input: CreateBookmarkInput = {
        raindrop_id: 12345,
        url: 'https://example.com/article',
        title: 'Test Article',
        tags: ['test'],
        created_at: new Date('2026-01-13'),
      };

      const inserted = insertBookmark(db, input);
      const retrieved = getBookmarkById(db, inserted.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(inserted.id);
      expect(retrieved?.raindrop_id).toBe(12345);
    });

    it('should return undefined for non-existent id', () => {
      const result = getBookmarkById(db, 999);
      expect(result).toBeUndefined();
    });
  });

  describe('getBookmarkByRaindropId', () => {
    it('should retrieve bookmark by raindrop_id', () => {
      const input: CreateBookmarkInput = {
        raindrop_id: 12345,
        url: 'https://example.com/article',
        title: 'Test Article',
        tags: ['test'],
        created_at: new Date('2026-01-13'),
      };

      insertBookmark(db, input);
      const retrieved = getBookmarkByRaindropId(db, 12345);

      expect(retrieved).toBeDefined();
      expect(retrieved?.raindrop_id).toBe(12345);
    });

    it('should return undefined for non-existent raindrop_id', () => {
      const result = getBookmarkByRaindropId(db, 999);
      expect(result).toBeUndefined();
    });
  });

  describe('updateBookmarkStatus', () => {
    it('should update bookmark status', () => {
      const input: CreateBookmarkInput = {
        raindrop_id: 12345,
        url: 'https://example.com/article',
        title: 'Test Article',
        tags: ['test'],
        created_at: new Date('2026-01-13'),
      };

      const bookmark = insertBookmark(db, input);

      updateBookmarkStatus(db, bookmark.id, {
        status: 'triage_approved',
        reason: 'Relevant content',
        confidence: 0.95,
        decided_by: 'ollama_qwen2.5',
      });

      const updated = getBookmarkById(db, bookmark.id);

      expect(updated?.status).toBe('triage_approved');
      expect(updated?.status_reason).toBe('Relevant content');
      expect(updated?.status_confidence).toBe(0.95);
      expect(updated?.status_decided_by).toBe('ollama_qwen2.5');
    });
  });

  describe('countByStatus', () => {
    it('should count bookmarks by status', () => {
      const inputs: CreateBookmarkInput[] = [
        {
          raindrop_id: 1,
          url: 'https://example.com/1',
          title: 'Article 1',
          tags: [],
          created_at: new Date(),
        },
        {
          raindrop_id: 2,
          url: 'https://example.com/2',
          title: 'Article 2',
          tags: [],
          created_at: new Date(),
        },
        {
          raindrop_id: 3,
          url: 'https://example.com/3',
          title: 'Article 3',
          tags: [],
          created_at: new Date(),
        },
      ];

      inputs.forEach((input) => {
        const bookmark = insertBookmark(db, input);
        if (bookmark.id === 2) {
          updateBookmarkStatus(db, bookmark.id, { status: 'triage_approved' });
        }
      });

      const pendingCount = countByStatus(db, 'triage_pending');
      const approvedCount = countByStatus(db, 'triage_approved');

      expect(pendingCount).toBe(2);
      expect(approvedCount).toBe(1);
    });
  });

  describe('getTotalCount', () => {
    it('should return total bookmark count', () => {
      const inputs: CreateBookmarkInput[] = [
        {
          raindrop_id: 1,
          url: 'https://example.com/1',
          title: 'Article 1',
          tags: [],
          created_at: new Date(),
        },
        {
          raindrop_id: 2,
          url: 'https://example.com/2',
          title: 'Article 2',
          tags: [],
          created_at: new Date(),
        },
      ];

      inputs.forEach((input) => insertBookmark(db, input));

      const total = getTotalCount(db);
      expect(total).toBe(2);
    });

    it('should return 0 for empty database', () => {
      const total = getTotalCount(db);
      expect(total).toBe(0);
    });
  });
});
