/**
 * Embedding Service
 *
 * Provides semantic embeddings for text using Ollama and nomic-embed-text.
 * Following functional-style service pattern.
 */

import { Ollama } from 'ollama';

const ollama = new Ollama();
const EMBEDDING_MODEL = 'nomic-embed-text:latest';

/**
 * Service to handle vector embeddings.
 */
export const EmbeddingService = {
    /**
     * Generate embedding for a string.
     */
    async embed(text: string): Promise<number[]> {
        try {
            const response = await ollama.embeddings({
                model: EMBEDDING_MODEL,
                prompt: text,
            });
            return response.embedding;
        } catch (error) {
            console.error(`Embedding failed: ${error}`);
            throw error;
        }
    },

    /**
     * Generate embeddings for a batch of strings.
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        // Ollama supports batch embeddings in some versions, but let's be safe
        const results: number[][] = [];
        for (const text of texts) {
            results.push(await this.embed(text));
        }
        return results;
    },

    /**
     * Calculate cosine similarity between two vectors.
     */
    calculateSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) {
            throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
        }
        const dotProduct = vecA.reduce((sum, a, i) => sum + a * (vecB[i] ?? 0), 0);
        const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
        const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (normA * normB);
    },
};
