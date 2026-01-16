/**
 * Backfill Embeddings Script
 * 
 * Generates embeddings for all approved/archived seeds that are missing them.
 */

import { initDatabase, closeDatabase } from '../db/schema.js';
import { getSeedsByTriageStatus, updateSeedEmbedding } from '../db/seed-operations.js';
import { EmbeddingService } from '../llm/embeddings.js';
import { logger } from '../config/logger.js';

async function main() {
    const db = initDatabase();

    try {
        logger.info('🔍 Fetching seeds for embedding backfill...');

        const approved = getSeedsByTriageStatus(db, 'approved');
        const archived = getSeedsByTriageStatus(db, 'archived');

        const allSeeds = [...approved, ...archived];
        const missing = allSeeds.filter(s => !s.embedding);

        logger.info(`Found ${allSeeds.length} total active seeds, ${missing.length} missing embeddings.`);

        if (missing.length === 0) {
            logger.info('✅ No backfill needed.');
            return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < missing.length; i++) {
            const seed = missing[i];
            process.stdout.write(`⚡ Processing ${i + 1}/${missing.length} (ID: ${seed.id})... `);

            try {
                const content = seed.content.join('\n');
                if (content.trim().length === 0) {
                    logger.warn(`Skipping seed ${seed.id} due to empty content.`);
                    continue;
                }

                const embedding = await EmbeddingService.embed(content);
                updateSeedEmbedding(db, seed.id, embedding);

                process.stdout.write('✅\n');
                successCount++;
            } catch (error) {
                process.stdout.write('❌\n');
                logger.error(`Error processing seed ${seed.id}: ${error}`);
                errorCount++;
            }
        }

        logger.info(`🎉 Backfill complete! Success: ${successCount}, Errors: ${errorCount}`);

    } finally {
        closeDatabase(db);
    }
}

main().catch(console.error);
