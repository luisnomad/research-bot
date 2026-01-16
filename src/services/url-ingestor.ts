import { extract } from '@extractus/article-extractor';
import { logger } from '../config/logger.js';
import { insertSeed, seedExists } from '../db/seed-operations.js';
import { initDatabase, closeDatabase } from '../db/schema.js';
import type { Seed } from '../ingestors/types.js';

/**
 * Service to handle generic URL ingestion
 */
export const UrlIngestorService = {
    /**
     * Ingest a URL into the knowledge base
     */
    async ingest(url: string): Promise<{ success: boolean; seedId?: number; error?: string; alreadyExists?: boolean }> {
        const db = initDatabase();

        try {
            // 1. Check if it's an X URL (TODO: use X-specific extractor if needed)
            // For now, let's treat everything as a general article or use a simple extractor

            // Deduplicate
            if (seedExists(db, 'manual', url)) {
                return { success: true, alreadyExists: true };
            }

            // 2. Extract content
            const article = await extract(url);

            if (!article) {
                return { success: false, error: 'Failed to extract content from URL' };
            }

            // 3. Normalize to Seed
            const seed: Seed = {
                source: 'manual',
                sourceId: url,
                url: url,
                author: article.author || 'Unknown',
                content: [article.content || article.description || ''],
                isThread: false,
                hasImages: !!article.image,
                extractedAt: new Date().toISOString(),
                metadata: {
                    title: article.title,
                    description: article.description,
                    published: article.published,
                    ttr: article.ttr,
                }
            };

            // 4. Save to DB
            const record = insertSeed(db, seed);

            logger.info(`URL ingested via Telegram: ${url} (ID: ${record.id})`);

            return { success: true, seedId: record.id };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to ingest URL ${url}: ${errorMsg}`);
            return { success: false, error: errorMsg };
        } finally {
            closeDatabase(db);
        }
    }
};
