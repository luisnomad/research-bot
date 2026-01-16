/**
 * Test Research Service
 *
 * pnpm tsx src/cli/test-research.ts "query"
 */

import { ResearchService } from '../services/research.js';

async function main() {
    const query = process.argv[2] || 'latest open source llms 2026';
    console.log(`\n🔍 Researching: "${query}"...\n`);

    const startTime = Date.now();
    const results = await ResearchService.search(query, 5);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (results.length === 0) {
        console.log('❌ No results found or search failed. Ensure Chrome is running with --remote-debugging-port=9222');
        return;
    }

    console.log(`✅ Found ${results.length} results in ${duration}s:\n`);

    results.forEach((r, i) => {
        console.log(`${i + 1}. [${r.title}](${r.url})`);
        console.log(`   ${r.description.substring(0, 150)}${r.description.length > 150 ? '...' : ''}\n`);
    });
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
