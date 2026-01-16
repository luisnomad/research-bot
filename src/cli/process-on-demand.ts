import { OrchestratorService } from '../services/orchestrator.js';

/**
 * CLI to process a single item or topic on-demand
 * 
 * Usage:
 *   pnpm process:item <id>
 *   pnpm process:topic <topic>
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const value = args[1];

    if (!command || !value) {
        console.log('\nUsage:');
        console.log('  pnpm process:item <id>      - Process a specific seed ID');
        console.log('  pnpm process:topic <name>   - Process all items with a specific topic\n');
        return;
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  🎯 On-Demand Processor: ${command} ${value}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        if (command === 'item') {
            const seedId = parseInt(value, 10);
            if (isNaN(seedId)) {
                console.error('❌ Invalid seed ID');
                return;
            }

            const result = await OrchestratorService.processOnDemand(seedId);
            if (result.success) {
                console.log(`✅ Success! Markdown generated at: ${result.path}`);
            } else {
                console.error(`❌ Failed: ${result.error}`);
            }
        } else if (command === 'topic') {
            const results = await OrchestratorService.processTopicOnDemand(value);
            console.log(`📊 Topic processing complete:`);
            console.log(`   - Found:     ${results.processed}`);
            console.log(`   - Success:   ${results.success}`);
            console.log(`   - Errors:    ${results.errors}`);
        } else {
            console.error('❌ Unknown command. Use "item" or "topic".');
        }
    } catch (error) {
        console.error('❌ Fatal error:', error);
    }
}

main().catch(console.error);
