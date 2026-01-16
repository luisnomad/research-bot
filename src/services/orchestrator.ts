import { initDatabase, closeDatabase } from '../db/schema.js';
import {
    getSeedsByTriageStatus,
    markSeedProcessed,
    getSeedById,
    searchSeedsByTopic,
    updateSeedEmbedding,
    semanticSearch,
    type SeedRecord
} from '../db/seed-operations.js';
import { TriageService, type TriageResult } from '../llm/triage.js';
import { generateMarkdown } from '../markdown/generator.js';
import { writeMarkdown, type MarkdownWriterConfig } from '../markdown/writer.js';
import { createGitService } from '../git/service.js';
import { NotificationService } from './telegram-notification.js';
import { EmbeddingService } from '../llm/embeddings.js';
import { logger } from '../config/logger.js';
import { getConfig } from '../config/index.js';

/**
 * Orchestrator Service
 * 
 * Chains together the different phases of the pipeline:
 * Import -> Triage -> Generate -> Notify
 */
export const OrchestratorService = {
    /**
     * Run the full nightly pipeline
     */
    async runNightlyProcessing(): Promise<void> {
        const db = initDatabase();
        const startTime = Date.now();

        logger.info('Starting nightly knowledge base processing...');

        try {
            // 1. Triage Pending Seeds
            logger.info('Phase 1: Triaging pending seeds...');
            const triageResults = await TriageService.runBatchTriage(db, 50); // limit 50 for now
            logger.info(`Triage Complete: ${triageResults.approved} approved, ${triageResults.errors} errors.`);

            // 2. Generate Markdown for Approved Seeds
            logger.info('Phase 2: Generating markdown for approved seeds...');
            const approvedSeeds = getSeedsByTriageStatus(db, 'approved');

            if (approvedSeeds.length === 0) {
                logger.info('No approved seeds to process for markdown generation.');
            } else {
                const genResults = await this.generateMarkdownBatch(db, approvedSeeds as SeedRecord[]);
                logger.info(`Generation Complete: ${genResults.success} files written, ${genResults.errors} errors.`);

                // 3. Notify
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                const report = [
                    '🌕 *Nightly Pipeline Complete*',
                    '',
                    `⏱ *Duration*: ${duration}s`,
                    `🔬 *Triaged*: ${triageResults.approved + triageResults.archived + triageResults.rejected} seeds`,
                    `  └ ✅ Approved: ${triageResults.approved}`,
                    `  └ 📦 Archived: ${triageResults.archived}`,
                    `  └ ❌ Rejected: ${triageResults.rejected}`,
                    triageResults.needsReview > 0 ? `⚠️ *Review Required*: ${triageResults.needsReview} item(s) flagged for manual check` : '',
                    `📝 *Markdown*: ${genResults.success} files generated`,
                    genResults.committed ? `📦 *Git*: Committed successfully` : '',
                ].filter(Boolean).join('\n');

                await NotificationService.notify(report);
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Nightly processing failed: ${errorMsg}`);
            await NotificationService.notify(`❌ *Nightly Pipeline Failed*\n\nError: ${errorMsg}`);
        } finally {
            closeDatabase(db);
        }
    },

    /**
     * Process a specific seed by ID on-demand
     */
    async processOnDemand(seedId: number): Promise<{ success: boolean; path?: string; error?: string }> {
        const db = initDatabase();
        try {
            const seed = getSeedById(db, seedId);
            if (!seed) {
                return { success: false, error: `Seed not found: ${seedId}` };
            }

            // 1. Triage if pending
            if (seed.triageStatus === 'pending') {
                logger.info(`Triaging seed ${seedId} on-demand...`);
                // We use runBatchTriage with limit 1 to reuse logic, or we can use triageSeed directly.
                // Reusing TriageService.runBatchTriage with a limit and a way to target ID would be better.
                // For now, let's just triage it.
                const result = await TriageService.triageSeed(seed);

                // Manually update the DB since we need to save topics too
                // (Note: updateTriageStatus now supports topics)
                const { updateTriageStatus } = await import('../db/seed-operations.js');
                const config = getConfig();
                updateTriageStatus(db, seedId, result.status, result.reason, result.confidence, config.ollama.model, result.topics || undefined);
            }

            // Refresh seed record
            const updatedSeed = getSeedById(db, seedId)!;

            // 2. Generate Markdown if approved/archived
            if (updatedSeed.triageStatus === 'approved' || updatedSeed.triageStatus === 'archived') {
                const genResults = await this.generateMarkdownBatch(db, [updatedSeed]);
                if (genResults.success > 0) {
                    return { success: true, path: updatedSeed.markdownPath };
                }
                return { success: false, error: 'Markdown generation failed' };
            }

            return { success: false, error: `Seed skipped: triage status is ${updatedSeed.triageStatus}` };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMsg };
        } finally {
            closeDatabase(db);
        }
    },

    /**
     * Process all items related to a topic on-demand
     */
    async processTopicOnDemand(topic: string): Promise<{ processed: number; success: number; errors: number }> {
        const db = initDatabase();
        try {
            logger.info(`Processing topic "${topic}" on-demand...`);
            const seeds = searchSeedsByTopic(db, topic);

            if (seeds.length === 0) {
                return { processed: 0, success: 0, errors: 0 };
            }

            const results = await this.generateMarkdownBatch(db, seeds as SeedRecord[]);
            return { processed: seeds.length, success: results.success, errors: results.errors };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Topic processing failed for "${topic}": ${errorMsg}`);
            return { processed: 0, success: 0, errors: 0 };
        } finally {
            closeDatabase(db);
        }
    },

    /**
     * Helper to generate markdown for a batch of seeds
     */
    async generateMarkdownBatch(db: any, seeds: SeedRecord[]) {
        const config = getConfig();
        const baseDir = config.system.knowledge_base_path;
        const outputDir = baseDir; // Use the configured path directly

        const gitService = config.git.auto_commit ? createGitService({ baseDir: process.cwd() }) : null;

        const writerConfig: MarkdownWriterConfig = {
            baseDir: outputDir,
            createDirs: true,
            overwrite: false,
        };

        let success = 0;
        let errors = 0;
        const processedPaths: string[] = [];

        for (const seed of seeds) {
            try {
                const triageResult: TriageResult = {
                    status: seed.triageStatus as 'approved' | 'archived' | 'rejected',
                    confidence: seed.triageConfidence ?? 0.5,
                    reason: seed.triageReason ?? 'No reason provided',
                    topics: seed.triageTopics,
                };

                // --- NEW: Generate Embedding & Find Neighbors ---
                let relatedSeeds: any[] = [];
                let currentEmbedding = seed.embedding;

                if (!currentEmbedding) {
                    try {
                        const contentToEmbed = seed.content.join('\n');
                        const embedding = await EmbeddingService.embed(contentToEmbed);
                        updateSeedEmbedding(db, seed.id, embedding);
                        currentEmbedding = embedding;
                        logger.info(`Generated embedding for seed ${seed.id}`);
                    } catch (embErr) {
                        logger.warn(`Failed to generate embedding for seed ${seed.id}: ${embErr}`);
                    }
                }

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
                    logger.info(`Found ${relatedSeeds.length} related seeds for seed ${seed.id}`);
                }
                // ---------------------------------------------

                const doc = generateMarkdown({
                    seed,
                    triageResult,
                    triagedAt: seed.triageAt ?? new Date().toISOString(),
                    relatedSeeds,
                });

                const result = await writeMarkdown(doc, writerConfig);
                if (result.success && result.path) {
                    success++;
                    processedPaths.push(result.path);
                    markSeedProcessed(db, seed.id, result.path);
                } else {
                    errors++;
                }
            } catch (err) {
                errors++;
                const errorMsg = err instanceof Error ? err.message : String(err);
                logger.error(`Failed to generate markdown for seed ${seed.id}: ${errorMsg}`);
            }
        }

        let committed = false;
        if (gitService && processedPaths.length > 0) {
            const commitMsg = `feat: On-demand update - Add ${processedPaths.length} entries\n\nGenerated: ${new Date().toISOString().split('T')[0]}`;
            const gitResult = await gitService.addAndCommit(processedPaths, commitMsg);
            committed = gitResult.success;
        }

        return { success, errors, committed };
    }
};
