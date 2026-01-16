/**
 * Test Embedding Service
 */

import { EmbeddingService } from '../llm/embeddings.js';

async function main() {
    const text1 = "Artificial intelligence and machine learning are transforming the software industry.";
    const text2 = "The tech world is being reshaped by AI and ML models.";
    const text3 = "I love eating delicious pizza with extra cheese.";

    console.log('\n🧠 Generating embeddings...\n');

    const emb1 = await EmbeddingService.embed(text1);
    const emb2 = await EmbeddingService.embed(text2);
    const emb3 = await EmbeddingService.embed(text3);

    console.log(`Vector Size: ${emb1.length}`);

    const sim12 = EmbeddingService.calculateSimilarity(emb1, emb2);
    const sim13 = EmbeddingService.calculateSimilarity(emb1, emb3);

    console.log(`\nSimilarity Results:`);
    console.log(`- "AI transforming industry" vs "AI reshaping tech": ${(sim12 * 100).toFixed(2)}% (Expected: High)`);
    console.log(`- "AI transforming industry" vs "I love pizza": ${(sim13 * 100).toFixed(2)}% (Expected: Low)`);
}

main().catch(console.error);
