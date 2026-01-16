import { OrchestratorService } from '../services/orchestrator.js';

/**
 * Manual trigger for the nightly pipeline
 */
async function main() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  🌕 Manual Nightly Pipeline Trigger');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        await OrchestratorService.runNightlyProcessing();
        console.log('\n✅ Pipeline execution finished.');
    } catch (error) {
        console.error('\n❌ Pipeline execution failed:', error);
        process.exit(1);
    }
}

main().catch(console.error);
