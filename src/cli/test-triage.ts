import { initDatabase, closeDatabase } from '../db/schema.js';
import { TriageService } from '../llm/triage.js';
import { Seed, IngestSource } from '../ingestors/types.js';

async function main() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  🧪 LLM Triage Test');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const db = initDatabase();

    try {
        // Get one pending seed
        const row = db.prepare(`
            SELECT * FROM seeds 
            WHERE triage_status = 'pending' 
            ORDER BY created_at DESC 
            LIMIT 1
        `).get() as any;

        if (!row) {
            console.log('ℹ️  No pending seeds found in database.');
            return;
        }

        const seed: Seed = {
            source: row.source as IngestSource,
            sourceId: row.source_id,
            url: row.url,
            author: row.author,
            content: JSON.parse(row.content),
            isThread: row.is_thread === 1,
            hasImages: row.has_images === 1,
            extractedAt: row.extracted_at,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        };

        console.log(`🧐 Triaging item from ${seed.author ?? 'Unknown'}:`);
        console.log(`   Source: ${seed.source} (${seed.sourceId})`);
        console.log(`   Content Preview: ${seed.content[0]?.substring(0, 100)}...\n`);

        console.log('⏳ Calling Ollama...');
        const startTime = Date.now();
        const result = await TriageService.triageSeed(seed);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`\n✅ Triage Complete (${duration}s):`);
        console.log(`   Status:     ${result.status.toUpperCase()}`);
        console.log(`   Confidence: ${result.confidence.toFixed(2)}`);
        console.log(`   Reason:     ${result.reason}`);

        if (result.topics && result.topics.length > 0) {
            console.log(`   Topics:     ${result.topics.join(', ')}`);
        }

        if (result.isOutdated) console.log('   ⚠️  Flagged as Outdated');
        if (result.isMisleading) console.log('   ⚠️  Flagged as Misleading');
        if (result.factCheckDetail) console.log(`   ℹ️  Fact-check: ${result.factCheckDetail}`);

        console.log('\n═══════════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Triage test failed:', error);
    } finally {
        closeDatabase(db);
    }
}

main().catch(console.error);
