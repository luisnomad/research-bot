/**
 * Test Embedding Persistence
 */

import { initDatabase, closeDatabase } from '../db/schema.js';
import { getPendingSeeds, updateSeedEmbedding, getSeedById } from '../db/seed-operations.js';
import { EmbeddingService } from '../llm/embeddings.js';

async function main() {
    const db = initDatabase();

    try {
        let seed = getPendingSeeds(db, 1)[0];
        if (!seed) {
            // Try getting any seed
            const allSeeds = db.prepare('SELECT id FROM seeds LIMIT 1').get() as { id: number } | undefined;
            if (allSeeds) {
                seed = getSeedById(db, allSeeds.id)!;
            }
        }

        if (!seed) {
            console.log('No seeds found in database.');
            return;
        }
        console.log(`\n🧪 Testing embedding persistence for seed: ${seed.id} (${seed.sourceId})`);

        const content = seed.content.join(' ');
        console.log(`Generating embedding for content (${content.length} chars)...`);

        const embedding = await EmbeddingService.embed(content);
        console.log(`Generated vector of size: ${embedding.length}`);

        console.log('Saving to database...');
        updateSeedEmbedding(db, seed.id, embedding);

        console.log('Reloading from database...');
        const updatedSeed = getSeedById(db, seed.id);

        if (updatedSeed && updatedSeed.embedding) {
            console.log(`✅ Success! Reloaded vector size: ${updatedSeed.embedding.length}`);

            // Verify first 3 values
            if (embedding && updatedSeed.embedding && embedding.length >= 3 && updatedSeed.embedding.length >= 3) {
                console.log('Original (first 3):', embedding.slice(0, 3));
                console.log('Reloaded (first 3):', updatedSeed.embedding.slice(0, 3));

                const diff = Math.abs(embedding[0] - updatedSeed.embedding[0]);
                if (diff < 0.00001) {
                    console.log('✅ Precision check passed.');
                } else {
                    console.log('❌ Precision check failed:', diff);
                }
            }
        } else {
            console.log('❌ Failed to reload embedding.');
        }
    } finally {
        closeDatabase(db);
    }
}

main().catch(console.error);
