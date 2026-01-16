/**
 * Semantic Search CLI Test
 */

import { initDatabase, closeDatabase } from '../db/schema.js';
import { semanticSearch } from '../db/seed-operations.js';
import { EmbeddingService } from '../llm/embeddings.js';
import { logger } from '../config/logger.js';

async function main() {
    const query = process.argv[2] || "AI agents and coding";
    const db = initDatabase();

    try {
        logger.info(`🔍 Searching for: "${query}"`);

        const queryEmbedding = await EmbeddingService.embed(query);
        const results = semanticSearch(db, queryEmbedding, 5);

        if (results.length === 0) {
            logger.info('❌ No results found.');
            return;
        }

        console.log('\nTop Search Results:');
        results.forEach((r, i) => {
            console.log(`\n${i + 1}. [${(r.similarity * 100).toFixed(1)}%] ${r.author || 'Unknown'}`);
            console.log(`   URL: ${r.url}`);
            // Show first part of content
            const preview = r.content[0]?.substring(0, 100) + '...';
            console.log(`   Content: ${preview}`);
        });

    } finally {
        closeDatabase(db);
    }
}

main().catch(console.error);
