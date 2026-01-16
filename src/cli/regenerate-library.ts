/**
 * Regenerate Library Script
 * 
 * Regenerates markdown files for ALL approved/archived notes.
 * This ensures that:
 * 1. All notes get the new "Related Notes" section
 * 2. Cross-linking is bidirectional and up-to-date
 */

import { initDatabase, closeDatabase } from '../db/schema.js';
import { getSeedsByTriageStatus, updateSeedEmbedding, semanticSearch } from '../db/seed-operations.js';
import { generateMarkdown } from '../markdown/generator.js';
import { writeMarkdown, type MarkdownWriterConfig } from '../markdown/writer.js';
import { EmbeddingService } from '../llm/embeddings.js';
import { logger } from '../config/logger.js';
import { getConfig } from '../config/index.js';

async function main() {
    const db = initDatabase();

    try {
        logger.info('📚 Starting full library regeneration...');

        // 1. Get all active seeds
        const approved = getSeedsByTriageStatus(db, 'approved');
        const archived = getSeedsByTriageStatus(db, 'archived');
        const allSeeds = [...approved, ...archived];

        logger.info(`Found ${allSeeds.length} total active seeds to regenerate.`);

        const config = getConfig();
        const baseDir = config.system.knowledge_base_path;
        const outputDir = baseDir; // Use the configured path directly

        const writerConfig: MarkdownWriterConfig = {
            baseDir: outputDir,
            createDirs: true,
            overwrite: true, // We want to update existing files
        };

        let updatedCount = 0;
        let errorCount = 0;

        for (let i = 0; i < allSeeds.length; i++) {
            const seed = allSeeds[i];
            process.stdout.write(`🔄 Processing ${i + 1}/${allSeeds.length} (ID: ${seed.id})... `);

            try {
                // Ensure embedding exists
                let currentEmbedding = seed.embedding;
                if (!currentEmbedding) {
                    const content = seed.content.join('\n');
                    if (content.trim()) {
                        currentEmbedding = await EmbeddingService.embed(content);
                        updateSeedEmbedding(db, seed.id, currentEmbedding);
                        // update local object
                        Object.defineProperty(seed, 'embedding', { value: currentEmbedding });
                    }
                }

                // Find related seeds
                let relatedSeeds: any[] = [];
                if (currentEmbedding) {
                    const similar = semanticSearch(db, currentEmbedding, 6);
                    relatedSeeds = similar
                        .filter(s => s.id !== seed.id && s.markdownPath)
                        .map(s => ({
                            title: s.content[0]?.slice(0, 50) || 'Untitled',
                            filename: s.markdownPath!.split('/').pop()!.replace('.md', ''),
                            similarity: s.similarity
                        }))
                        .slice(0, 5);
                }

                // Generate Markdown
                const doc = generateMarkdown({
                    seed,
                    triageResult: {
                        status: seed.triageStatus as 'approved' | 'archived' | 'rejected',
                        confidence: seed.triageConfidence ?? 0.5,
                        reason: seed.triageReason ?? 'No reason provided',
                        topics: seed.triageTopics,
                    },
                    triagedAt: seed.triageAt ?? new Date().toISOString(),
                    relatedSeeds
                });

                // Write file
                await writeMarkdown(doc, writerConfig);

                process.stdout.write('✅\n');
                updatedCount++;

            } catch (error) {
                process.stdout.write('❌\n');
                logger.error(`Error regenerating seed ${seed.id}: ${error}`);
                errorCount++;
            }
        }

        logger.info(`✨ Regeneration complete! Updated: ${updatedCount}, Errors: ${errorCount}`);

    } finally {
        closeDatabase(db);
    }
}

main().catch(console.error);
