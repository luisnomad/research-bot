#!/usr/bin/env node
/**
 * X Bookmarks Import CLI
 *
 * Usage: pnpm import:x <folder-url>
 *
 * Imports bookmarks from an X (Twitter) bookmarks folder.
 * Requires Chrome running with CDP enabled.
 */

import { formatDuration, runFullImport } from '../ingestors/x-bookmarks/index.js';
import type { CollectionProgress } from '../ingestors/x-bookmarks/types.js';
import type { IngestItem } from '../ingestors/types.js';
import { initDatabase, closeDatabase } from '../db/schema.js';
import { insertSeeds, getSeedStats, seedExists } from '../db/seed-operations.js';

// ============================================================================
// CLI Implementation
// ============================================================================

const printUsage = (): void => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                        X Bookmarks Import CLI                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  USAGE:                                                                       ║
║    pnpm import:x <folder-url>                                                 ║
║                                                                               ║
║  EXAMPLE:                                                                     ║
║    pnpm import:x https://x.com/i/bookmarks/1899171982010130843                ║
║                                                                               ║
║  PREREQUISITES:                                                               ║
║    1. Launch Chrome with CDP enabled:                                         ║
║       /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\       ║
║         --remote-debugging-port=9222 \\                                        ║
║         --user-data-dir="$HOME/chrome-profile-cdp"                            ║
║                                                                               ║
║    2. Log into X (Twitter) in that Chrome instance                            ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
};

const onCollectionProgress = (progress: CollectionProgress): void => {
    const elapsed = formatDuration(progress.elapsedMs);
    process.stdout.write(
        `\r   Scroll #${progress.scrollNumber} | Found: ${progress.totalFound} | New: +${progress.newItemsFound} | Time: ${elapsed}   `
    );
};

const onExtractionProgress = (current: number, total: number, item: IngestItem): void => {
    console.log(`   [${current}/${total}] Extracting: ${item.author} - ${item.previewText?.substring(0, 40)}...`);
};

const main = async (): Promise<void> => {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(0);
    }

    const folderUrl = args[0];

    // Validate that we have a URL (TypeScript flow analysis)
    if (!folderUrl) {
        printUsage();
        process.exit(1);
    }

    // Validate URL format
    if (!folderUrl.includes('x.com/i/bookmarks') && !folderUrl.includes('twitter.com/i/bookmarks')) {
        console.error('❌ Invalid URL. Expected an X bookmarks folder URL.');
        console.error('   Example: https://x.com/i/bookmarks/1899171982010130843');
        process.exit(1);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  X Bookmarks Import');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`   Folder: ${folderUrl}\n`);

    // Initialize database
    console.log('   📂 Initializing database...\n');
    const db = initDatabase();

    try {
        // Check if we should skip already-processed seeds
        const isProcessedFn = async (sourceId: string): Promise<boolean> => {
            return seedExists(db, 'x-bookmarks', sourceId);
        };

        const result = await runFullImport({
            folderUrl,
            onCollectionProgress,
            onExtractionProgress,
            isProcessedFn,
        });

        console.log('\n\n═══════════════════════════════════════════════════════════════');
        console.log('  📊 Extraction Complete');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`   Collected:  ${result.stats.collected} bookmarks`);
        console.log(`   Extracted:  ${result.stats.extracted} seeds`);
        console.log(`   Skipped:    ${result.stats.skipped} (already in database)`);
        console.log(`   Failed:     ${result.stats.failed}`);
        console.log(`   Duration:   ${formatDuration(result.stats.durationMs)}`);
        console.log('');

        if (result.seeds.length > 0) {
            console.log('   First 3 extracted seeds:');
            result.seeds.slice(0, 3).forEach((seed, i) => {
                const preview = seed.content[0]?.substring(0, 60) ?? '(no content)';
                console.log(`   ${i + 1}. ${seed.author}: "${preview}..."`);
                console.log(`      Thread: ${seed.isThread ? `Yes (${seed.content.length} parts)` : 'No'}`);
            });
            console.log('');
        }

        // Save seeds to database
        if (result.seeds.length > 0) {
            console.log('   💾 Saving seeds to database...');
            const { inserted, skipped } = insertSeeds(db, result.seeds);
            console.log(`   ✅ Saved ${inserted} seeds (${skipped} duplicates skipped)\n`);
        }

        // Show database stats
        const stats = getSeedStats(db);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  📈 Database Status');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`   Total seeds:     ${stats.total}`);
        console.log(`   Pending triage:  ${stats.pending}`);
        console.log(`   Approved:        ${stats.approved}`);
        console.log(`   Archived:        ${stats.archived}`);
        console.log(`   Rejected:        ${stats.rejected}`);
        console.log(`   Processed:       ${stats.processed}`);
        console.log('');
        console.log('   By source:');
        for (const [source, count] of Object.entries(stats.bySource)) {
            console.log(`     ${source}: ${count}`);
        }
        console.log('\n═══════════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ Import failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    } finally {
        closeDatabase(db);
    }
};

main().catch((error) => {
    console.error('Uncaught error:', error);
    process.exit(1);
});

