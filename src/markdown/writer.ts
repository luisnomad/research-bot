/**
 * Markdown Writer Service
 *
 * Handles writing markdown files to the filesystem with proper directory structure.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { MarkdownDocument } from './types.js';
import { serializeMarkdown } from './generator.js';
import { resolveFilenameCollision } from './filename.js';

/**
 * Configuration for markdown output
 */
export interface MarkdownWriterConfig {
    /** Base directory for all markdown output */
    readonly baseDir: string;

    /** Whether to create directories if they don't exist */
    readonly createDirs?: boolean;

    /** Whether to overwrite existing files */
    readonly overwrite?: boolean;
}

/**
 * Result of writing a markdown file
 */
export interface WriteResult {
    /** Whether the write was successful */
    readonly success: boolean;

    /** Full path to the written file */
    readonly path?: string;

    /** Error message if write failed */
    readonly error?: string;

    /** Whether filename was changed due to collision */
    readonly renamed?: boolean;
}

/**
 * Ensure a directory exists, creating it if necessary
 */
const ensureDir = async (dirPath: string): Promise<void> => {
    if (!existsSync(dirPath)) {
        await mkdir(dirPath, { recursive: true });
    }
};

/**
 * Get all existing filenames in a directory
 */
const getExistingFilenames = async (dirPath: string): Promise<Set<string>> => {
    if (!existsSync(dirPath)) {
        return new Set();
    }

    const { readdir } = await import('fs/promises');
    const files = await readdir(dirPath);
    return new Set(files);
};

/**
 * Write a markdown document to the filesystem
 */
export const writeMarkdown = async (
    doc: MarkdownDocument,
    config: MarkdownWriterConfig
): Promise<WriteResult> => {
    try {
        // Determine target directory
        const targetDir = join(config.baseDir, doc.directory);

        // Create directory if needed
        if (config.createDirs !== false) {
            await ensureDir(targetDir);
        }

        // Check for filename collisions
        let finalFilename = doc.filename;
        let renamed = false;

        if (!config.overwrite) {
            const existingFiles = await getExistingFilenames(targetDir);
            const resolvedFilename = resolveFilenameCollision(doc.filename, existingFiles);

            if (resolvedFilename !== doc.filename) {
                finalFilename = resolvedFilename;
                renamed = true;
            }
        }

        // Generate full path
        const fullPath = join(targetDir, finalFilename);

        // Serialize and write
        const content = serializeMarkdown(doc);
        await writeFile(fullPath, content, 'utf-8');

        return {
            success: true,
            path: fullPath,
            renamed,
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: errorMsg,
        };
    }
};

/**
 * Write multiple markdown documents
 */
export const writeMarkdownBatch = async (
    docs: readonly MarkdownDocument[],
    config: MarkdownWriterConfig
): Promise<readonly WriteResult[]> => {
    return Promise.all(docs.map((doc) => writeMarkdown(doc, config)));
};
