import { initDatabase, closeDatabase } from '../db/schema.js';
import { TriageService } from '../llm/triage.js';
import { Seed, IngestSource } from '../ingestors/types.js';

async function main() {
    const args = process.argv.slice(2);
    const limit = args[0] ? parseInt(args[0], 10) : 10;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  🔬 Batch Triage Processor (Limit: ${limit})`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    const db = initDatabase();

    try {
        // Get pending seeds
        const rows = db
            .prepare(
                `
            SELECT * FROM seeds 
            WHERE triage_status = 'pending' 
            ORDER BY created_at DESC 
            LIMIT ?
        `
            )
            .all(limit) as any[];

        if (rows.length === 0) {
            console.log('ℹ️  No pending seeds found in database.');
            return;
        }

        console.log(`📊 Found ${rows.length} pending seeds\n`);

        const results = {
            approved: 0,
            archived: 0,
            rejected: 0,
            needsReview: 0,
            errors: 0,
        };

        const startTime = Date.now();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const seed: Seed = {
                source: row.source as IngestSource,
                sourceId: row.source_id,
                url: row.url,
                author: row.author,
                content: JSON.parse(row.content),
                isThread: row.is_thread === 1,
                hasImages: row.has_images === 1,
                extractedAt: row.extracted_at,
                metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            };

            console.log(`\n[${i + 1}/${rows.length}] Triaging: ${seed.author ?? 'Unknown'}`);
            console.log(`   URL: ${seed.url}`);
            console.log(`   Preview: ${seed.content[0]?.substring(0, 80)}...`);

            try {
                const result = await TriageService.triageSeed(seed);

                // Update database
                db.prepare(
                    `
                    UPDATE seeds 
                    SET triage_status = ?,
                        triage_confidence = ?,
                        triage_reason = ?,
                        triage_decided_by = ?,
                        triage_at = ?
                    WHERE id = ?
                `
                ).run(
                    result.status,
                    result.confidence,
                    result.reason,
                    'llama3.2-vision:latest',
                    new Date().toISOString(),
                    row.id
                );

                // Track results
                results[result.status]++;
                if (result.needsReview) {
                    results.needsReview++;
                }

                console.log(`   ✅ ${result.status.toUpperCase()} (${(result.confidence * 100).toFixed(0)}%)`);
                console.log(`   Reason: ${result.reason}`);
                if (result.needsReview) {
                    console.log(`   ⚠️  NEEDS REVIEW (low confidence)`);
                }
            } catch (error) {
                results.errors++;
                console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  📈 Batch Triage Complete');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`⏱️  Duration: ${duration}s (avg ${(parseFloat(duration) / rows.length).toFixed(2)}s per seed)`);
        console.log(`\n📊 Results:`);
        console.log(`   ✅ Approved:     ${results.approved}`);
        console.log(`   📦 Archived:     ${results.archived}`);
        console.log(`   ❌ Rejected:     ${results.rejected}`);
        console.log(`   ⚠️  Needs Review: ${results.needsReview}`);
        console.log(`   💥 Errors:       ${results.errors}`);
        console.log('\n═══════════════════════════════════════════════════════════════\n');
    } catch (error) {
        console.error('❌ Batch triage failed:', error);
    } finally {
        closeDatabase(db);
    }
}

main().catch(console.error);
