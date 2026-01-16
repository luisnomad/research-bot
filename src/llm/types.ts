export type ModelCapability = 'vision' | 'chat' | 'embeddings' | 'tool-use' | 'fast' | 'high-quality';

export interface ModelInfo {
    name: string;
    id: string;
    size: number; // in bytes
    modified: string;
    capabilities: ModelCapability[];
    params?: string; // e.g. "14B"
    description?: string;
    contextWindow?: number;
    qualityScore: number; // 1-10
    speedScore: number; // 1-10
}

export interface ModelDiscoveryResult {
    models: ModelInfo[];
    recommendedTriage?: string;
    recommendedEmbeddings?: string;
}
