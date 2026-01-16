import { OllamaService } from '../llm/ollama.js';

async function main() {
    const runBenchmark = process.argv.includes('--benchmark');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  🔍 Ollama Model Discovery');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const models = await OllamaService.listModels();

    if (models.length === 0) {
        console.log('❌ No models found. Is Ollama running?');
        return;
    }

    for (const model of models) {
        const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(2);
        console.log(`✨ ${model.name}`);
        console.log(`   ID: ${model.id.substring(0, 12)}`);
        console.log(`   Size: ${sizeGB} GB | Params: ${model.params || 'Unknown'}`);
        console.log(`   Capabilities: ${model.capabilities.join(', ')}`);
        console.log(`   Quality: ${model.qualityScore}/10 | Speed: ${model.speedScore}/10`);

        if (runBenchmark) {
            process.stdout.write('   ⚡ Benchmarking...');
            const bench = await OllamaService.benchmarkModel(model.name);
            process.stdout.write(`\r   ⚡ Benchmark: ${bench.tokensPerSec.toFixed(1)} tok/s (${bench.durationMs}ms)   \n`);
        }
        console.log('');
    }

    const highQuality = [...models].sort((a, b) => b.qualityScore - a.qualityScore);
    const vision = models.filter((m) => m.capabilities.includes('vision'));
    const speed = [...models].sort((a, b) => b.speedScore - a.speedScore);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  💡 Recommendations');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (highQuality.length > 0 && highQuality[0]) {
        console.log(`   🏆 Best for Triage: ${highQuality[0].name} (${highQuality[0].qualityScore}/10)`);
    }

    if (speed.length > 0 && speed[0]) {
        console.log(`   ⚡ Best for Quick Tasks: ${speed[0].name} (${speed[0].speedScore}/10)`);
    }

    if (vision.length > 0) {
        console.log(`   👁️  Vision Support: ${vision.map((m) => m.name).join(', ')}`);
    }

    const embedModel = models.find((m) => m.capabilities.includes('embeddings'));
    if (embedModel) {
        console.log(`   🧠 Best for Embeddings: ${embedModel.name}`);
    } else {
        console.log('   🧠 Best for Embeddings: None found (pull nomic-embed-text)');
    }

    if (!runBenchmark) {
        console.log('\n   (Tip: Run with --benchmark to see actual speed on this hardware)');
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
