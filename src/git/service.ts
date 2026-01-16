import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import { GitServiceConfig, GitCommitResult, GitStatus } from './types.js';

/**
 * Service to handle Git operations for the knowledge base.
 */
export const createGitService = (config: GitServiceConfig) => {
    const options: Partial<SimpleGitOptions> = {
        baseDir: config.baseDir,
        binary: 'git',
        maxConcurrentProcesses: 6,
        trimmed: true,
    };

    const git: SimpleGit = simpleGit(options);

    return {
        /**
         * Initialize basic user config if provided
         */
        async initConfig(): Promise<void> {
            if (config.userName) {
                await git.addConfig('user.name', config.userName);
            }
            if (config.userEmail) {
                await git.addConfig('user.email', config.userEmail);
            }
        },

        /**
         * Get current status of the repository
         */
        async getStatus(): Promise<GitStatus> {
            const status = await git.status();
            return {
                isClean: status.isClean(),
                modified: status.modified,
                not_added: status.not_added,
                staged: status.staged,
            };
        },

        /**
         * Add files to staging area
         */
        async add(files: string | string[]): Promise<void> {
            await git.add(files);
        },

        /**
         * Create a commit
         */
        async commit(message: string, files?: string | string[]): Promise<GitCommitResult> {
            try {
                const result = await git.commit(message, files);
                return {
                    success: true,
                    hash: result.commit,
                    summary: {
                        changes: result.summary.changes,
                        insertions: result.summary.insertions,
                        deletions: result.summary.deletions,
                    },
                };
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                return {
                    success: false,
                    error: errorMsg,
                };
            }
        },

        /**
         * Add and commit files in one go
         * Safe: Only commits the specified files, ignoring other staged changes.
         */
        async addAndCommit(files: string | string[], message: string): Promise<GitCommitResult> {
            await this.add(files);
            return this.commit(message, files);
        }
    };
};
