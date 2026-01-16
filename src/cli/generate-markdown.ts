#!/usr/bin/env node
/**
 * Generate Markdown CLI
 *
 * Generates FOAM-compatible markdown files from triaged seeds.
 *
 * Usage:
 *   pnpm generate:markdown [options]
 *
 * Options:
 *   --limit N       Process only N seeds (default: all)
 *   --status STATUS Process seeds with specific status (default: approved)
 *   --output DIR    Output directory (default: ./knowledge)
 *   --dry-run       Show what would be generated without writing files
 */

import { initDatabase, closeDatabase } from '../db/schema.js';
import {
    getSeedsByTriageStatus,
    markSeedProcessed,
    type SeedRecord,
} from '../db/seed-operations.js';
import { generateMarkdown } from '../markdown/generator.js';
import { type MarkdownGenerationInput } from '../markdown/types.js';
import { writeMarkdown, type MarkdownWriterConfig } from '../markdown/writer.js';
import { type TriageResult } from '../llm/triage.js';
import { createGitService } from '../git/service.js';

/**
 * Parse command line arguments
 */
const parseArgs = (): {
    limit?: number;
    status: 'approved' | 'archived' | 'rejected';
    outputDir: string;
    dryRun: boolean;
    commit: boolean;
} => {
    const args = process.argv.slice(2);
    let limit: number | undefined;
    let status: 'approved' | 'archived' | 'rejected' = 'approved';
    let outputDir = './knowledge';
    let dryRun = false;
    let commit = true;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--limit' && i + 1 < args.length) {
            const nextArg = args[i + 1];
            if (nextArg) {
                limit = parseInt(nextArg, 10);
            }
            i++;
        } else if (arg === '--status' && i + 1 < args.length) {
            const statusArg = args[i + 1];
            if (statusArg === 'approved' || statusArg === 'archived' || statusArg === 'rejected') {
                status = statusArg;
            }
            i++;
        } else if (arg === '--output' && i + 1 < args.length) {
            const nextArg = args[i + 1];
            if (nextArg) {
                outputDir = nextArg;
            }
            i++;
        } else if (arg === '--dry-run') {
            dryRun = true;
        } else if (arg === '--no-commit') {
            commit = false;
        }
    }

    return { limit, status, outputDir, dryRun, commit };
};

/**
 * Convert SeedRecord to TriageResult
 */
const seedRecordToTriageResult = (record: SeedRecord): TriageResult => {
    // Parse topics from triage reason if available
    // This is a simplified version - in production you'd store topics separately
    const topics: string[] = [];

    return {
        status: record.triageStatus as 'approved' | 'archived' | 'rejected',
        confidence: record.triageConfidence ?? 0.5,
        reason: record.triageReason ?? 'No reason provided',
        topics: topics.length > 0 ? topics : undefined,
        isOutdated: undefined,
        isMisleading: undefined,
        factCheckDetail: undefined,
    };
};

/**
 * Main execution
 */
const main = async (): Promise<void> => {
    const { limit, status, outputDir, dryRun, commit } = parseArgs();

    console.log('🚀 Markdown Generation Starting...\n');
    console.log(`Status: ${status}`);
    console.log(`Output: ${outputDir}`);
    if (limit) console.log(`Limit: ${limit} seeds`);
    if (dryRun) console.log('Mode: DRY RUN (no files will be written)\n');
    else console.log('');

    // Initialize database
    const db = initDatabase();

    // Initialize Git service if needed
    const gitService = (commit && !dryRun) ? createGitService({ baseDir: process.cwd() }) : null;

    try {
        // Get seeds by status
        const seeds = getSeedsByTriageStatus(db, status, limit);

        if (seeds.length === 0) {
            console.log(`❌ No seeds found with status: ${status}`);
            return;
        }

        console.log(`📋 Found ${seeds.length} seed(s) to process\n`);

        // Configure writer
        const writerConfig: MarkdownWriterConfig = {
            baseDir: outputDir,
            createDirs: true,
            overwrite: false,
        };

        let successCount = 0;
        let errorCount = 0;
        let renamedCount = 0;
        const processedPaths: string[] = [];

        // Process each seed
        for (const seed of seeds) {
            try {
                // Convert to generation input
                const triageResult = seedRecordToTriageResult(seed);
                const input: MarkdownGenerationInput = {
                    seed,
                    triageResult,
                    triagedAt: seed.triageAt ?? new Date().toISOString(),
                };

                // Generate markdown
                const doc = generateMarkdown(input);

                console.log(`📝 ${doc.directory}/${doc.filename}`);
                console.log(`   Author: ${seed.author ?? 'Unknown'}`);
                console.log(`   Confidence: ${Math.round(triageResult.confidence * 100)}%`);

                if (!dryRun) {
                    // Write to filesystem
                    const result = await writeMarkdown(doc, writerConfig);

                    if (result.success) {
                        successCount++;
                        if (result.path) {
                            processedPaths.push(result.path);
                        }
                        if (result.renamed) {
                            renamedCount++;
                            console.log(`   ⚠️  Renamed to avoid collision`);
                        }

                        // Update database with markdown path
                        if (result.path) {
                            markSeedProcessed(db, seed.id, result.path);
                        }

                        console.log(`   ✅ Written`);
                    } else {
                        errorCount++;
                        console.log(`   ❌ Error: ${result.error}`);
                    }
                } else {
                    console.log(`   ✅ Would write (dry run)`);
                    successCount++;
                }

                console.log('');
            } catch (error) {
                errorCount++;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(`   ❌ Error: ${errorMsg}\n`);
            }
        }

        // Summary
        console.log('─'.repeat(50));
        console.log(`\n📊 Summary:`);
        console.log(`   Total processed: ${seeds.length}`);
        console.log(`   ✅ Success: ${successCount}`);
        if (renamedCount > 0) {
            console.log(`   ⚠️  Renamed: ${renamedCount}`);
        }
        if (errorCount > 0) {
            console.log(`   ❌ Errors: ${errorCount}`);
        }

        if (!dryRun && successCount > 0) {
            console.log(`\n✨ Markdown files written to: ${outputDir}`);

            // Git commit
            if (gitService && processedPaths.length > 0) {
                console.log('\n📦 Git Integration:');
                console.log(`   Staging ${processedPaths.length} files...`);

                try {
                    const commitMsg = `feat: Add ${processedPaths.length} new knowledge base entries (${status})\n\nSource: ${status} seeds\nGenerated: ${new Date().toISOString().split('T')[0]}`;
                    const result = await gitService.addAndCommit(processedPaths, commitMsg);

                    if (result.success) {
                        console.log(`   ✅ Committed: ${result.hash?.slice(0, 7)}`);
                        console.log(`   📝 Message: feat: Add ${processedPaths.length} new knowledge base entries...`);
                    } else {
                        console.log(`   ❌ Git commit failed: ${result.error}`);
                    }
                } catch (gitError) {
                    console.log(`   ❌ Git error: ${gitError instanceof Error ? gitError.message : String(gitError)}`);
                }
            }
        }
    } finally {
        closeDatabase(db);
    }
};

// Run
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

