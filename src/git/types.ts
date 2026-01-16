/**
 * Git Integration Types
 */

export interface GitCommitResult {
    readonly success: boolean;
    readonly hash?: string;
    readonly branch?: string;
    readonly summary?: {
        readonly changes: number;
        readonly insertions: number;
        readonly deletions: number;
    };
    readonly error?: string;
}

export interface GitStatus {
    readonly isClean: boolean;
    readonly modified: readonly string[];
    readonly not_added: readonly string[];
    readonly staged: readonly string[];
}

export interface GitServiceConfig {
    readonly baseDir: string;
    readonly userName?: string;
    readonly userEmail?: string;
}
