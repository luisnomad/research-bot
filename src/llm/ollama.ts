import { Ollama } from 'ollama';
import { ModelInfo, ModelCapability } from './types.js';
import { getConfig } from '../config/index.js';

const ollama = new Ollama();

/**
 * Service to interact with the local Ollama instance and discover models.
 */
export const OllamaService = {
    /**
     * List all locally available models and infer their capabilities.
     */
    async listModels(): Promise<ModelInfo[]> {
        try {
            const response = await ollama.list();
            return response.models.map((model) => {
                const capabilities = this.inferCapabilities(model.name, model.details);
                const { quality, speed } = this.calculateScores(model.name, model.details);

                return {
                    name: model.name,
                    id: model.digest,
                    size: model.size,
                    modified: model.modified_at.toString(),
                    capabilities,
                    params: model.details?.parameter_size,
                    description: `Family: ${model.details?.family}`,
                    qualityScore: quality,
                    speedScore: speed,
                };
            });
        } catch (error) {
            console.error('Failed to list Ollama models:', error);
            return [];
        }
    },

    /**
     * Infer model capabilities based on its name and details metadata.
     */
    inferCapabilities(name: string, details?: any): ModelCapability[] {
        const caps: ModelCapability[] = ['chat'];
        const lowerName = name.toLowerCase();

        // Vision detection
        if (lowerName.includes('vision') || lowerName.includes('llava') || lowerName.includes('moondream')) {
            caps.push('vision');
        }

        // Embeddings detection
        if (lowerName.includes('embed') || lowerName.includes('nomic') || lowerName.includes('mxbai')) {
            caps.push('embeddings');
        }

        // Speed/Quality heuristics based on parameter size
        if (details?.parameter_size) {
            const params = parseFloat(details.parameter_size);
            if (!isNaN(params)) {
                if (params < 4) {
                    caps.push('fast');
                } else if (params >= 13) {
                    caps.push('high-quality');
                }
            }
        }

        // Tool use (modern llama3/3.1/3.2 and qwen2.5 usually support it)
        if (lowerName.includes('llama3') || lowerName.includes('qwen2.5') || lowerName.includes('mistral')) {
            caps.push('tool-use');
        }

        return caps;
    },

    /**
     * Calculate quality and speed scores based on model metadata.
     */
    calculateScores(name: string, details?: any): { quality: number; speed: number } {
        let quality = 5;
        let speed = 5;
        const lowerName = name.toLowerCase();

        if (details?.parameter_size) {
            const params = parseFloat(details.parameter_size);
            if (!isNaN(params)) {
                // Quality
                if (params >= 7) quality += 2;
                if (params >= 13) quality += 2;
                if (params >= 30) quality += 2;
                if (params < 4) quality -= 2;

                // Speed
                if (params < 4) speed += 4;
                else if (params < 8) speed += 2;
                else if (params >= 13) speed -= 2;
                else if (params >= 30) speed -= 2;
            }
        }

        // Boost known good models
        if (lowerName.includes('qwen2.5')) quality += 1;
        if (lowerName.includes('llama3.1') || lowerName.includes('llama3.2')) quality += 1;

        // Cap at 1-10
        return {
            quality: Math.max(1, Math.min(10, quality)),
            speed: Math.max(1, Math.min(10, speed)),
        };
    },

    /**
     * Get specific model info
     */
    async getModelDetails(name: string) {
        try {
            return await ollama.show({ model: name });
        } catch (error) {
            console.error(`Failed to get details for model ${name}:`, error);
            return null;
        }
    },

    /**
     * Pull a model from the Ollama library.
     */
    async pullModel(name: string, onProgress?: (percent: number) => void): Promise<void> {
        try {
            const stream = await ollama.pull({ model: name, stream: true });
            for await (const part of stream) {
                if (part.total && part.completed && onProgress) {
                    onProgress(Math.round((part.completed / part.total) * 100));
                }
            }
        } catch (error) {
            console.error(`Failed to pull model ${name}:`, error);
            throw error;
        }
    },

    /**
     * Benchmark a model by generating a standard response and measuring speed.
     */
    async benchmarkModel(name: string): Promise<{ tokensPerSec: number; durationMs: number }> {
        const prompt = 'Explain the importance of local LLMs in 3 sentences.';
        const start = Date.now();

        try {
            const response = await ollama.generate({
                model: name,
                prompt,
                stream: false,
            });
            const durationMs = Date.now() - start;

            // Heuristic for tokens (approx 4 chars per token)
            const tokenCount = response.response.length / 4;
            const tokensPerSec = (tokenCount / durationMs) * 1000;

            return { tokensPerSec, durationMs };
        } catch (error) {
            console.error(`Benchmarking failed for ${name}:`, error);
            return { tokensPerSec: 0, durationMs: 0 };
        }
    },

    /**
     * Recommend the best available model for a specific task.
     */
    async recommendModel(task: 'triage' | 'summarize' | 'embeddings' | 'vision'): Promise<string | null> {
        const config = getConfig();
        const models = await this.listModels();

        switch (task) {
            case 'embeddings':
                // Respect config if it matches an available model, or use first embedding model found
                const configEmbed = config.ollama.embedding_model;
                if (models.some(m => m.name === configEmbed)) return configEmbed;
                return models.find((m) => m.capabilities.includes('embeddings'))?.name ?? configEmbed;

            case 'vision':
                return models.find((m) => m.capabilities.includes('vision'))?.name ?? null;

            case 'triage':
            case 'summarize':
                // Respect configured primary model if available
                const configModel = config.ollama.model;
                if (models.some(m => m.name === configModel)) return configModel;

                // Fallback to discovery
                return (
                    models.find((m) => m.capabilities.includes('high-quality'))?.name ??
                    models.find((m) => m.capabilities.includes('chat'))?.name ??
                    configModel
                );
            default:
                return models[0]?.name ?? config.ollama.model;
        }
    },
};
