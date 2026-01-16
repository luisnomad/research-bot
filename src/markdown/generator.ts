/**
 * Markdown Generator
 *
 * Generates FOAM-compatible markdown files from triaged seeds.
 */

import matter from 'gray-matter';
import { MarkdownDocument, MarkdownFrontmatter, MarkdownGenerationInput } from './types.js';
import { generateFilename } from './filename.js';

/**
 * Generate wikilinks from topics
 */
export const generateWikilinks = (topics: readonly string[] | undefined | null): string => {
    if (!topics || topics.length === 0) {
        return '';
    }

    return topics.map((topic) => `- [[${topic}]]`).join('\n');
};

/**
 * Format content for markdown body
 */
export const formatContent = (content: readonly string[], isThread: boolean): string => {
    if (!isThread || content.length === 1) {
        return content[0] ?? '';
    }

    // For threads, number each part
    return content.map((part, index) => `### Part ${index + 1}\n\n${part}`).join('\n\n---\n\n');
};

/**
 * Generate triage notes section
 */
export const generateTriageNotes = (
    status: string,
    confidence: number,
    reason: string,
    factCheckDetail?: string | null
): string => {
    const confidencePercent = Math.round(confidence * 100);

    let notes = `## Triage Notes\n\n`;
    notes += `**Decision**: ${status.charAt(0).toUpperCase() + status.slice(1)}  \n`;
    notes += `**Confidence**: ${confidencePercent}%  \n`;
    notes += `**Reason**: ${reason}\n`;

    if (factCheckDetail) {
        notes += `\n**Fact Check**: ${factCheckDetail}\n`;
    }

    return notes;
};

/**
 * Generate a complete markdown document from a seed and triage result
 */
export const generateMarkdown = (input: MarkdownGenerationInput): MarkdownDocument => {
    const { seed, triageResult, triagedAt } = input;

    // Build frontmatter
    const frontmatter: MarkdownFrontmatter = {
        source: seed.source,
        source_id: seed.sourceId,
        author: seed.author,
        url: seed.url,
        created: seed.extractedAt?.split('T')[0] ?? new Date().toISOString().split('T')[0],
        triaged: triagedAt?.split('T')[0] ?? new Date().toISOString().split('T')[0],
        status: triageResult.status,
        confidence: triageResult.confidence,
        topics: triageResult.topics || undefined,
        outdated: triageResult.isOutdated || undefined,
        misleading: triageResult.isMisleading || undefined,
        is_thread: seed.isThread || undefined,
        has_images: seed.hasImages || undefined,
    };

    // Build body
    const title = (seed.content[0] ?? 'Untitled').slice(0, 80).trim();
    const formattedContent = formatContent(seed.content, seed.isThread);
    const triageNotes = generateTriageNotes(
        triageResult.status,
        triageResult.confidence,
        triageResult.reason,
        triageResult.factCheckDetail
    );
    const wikilinks = generateWikilinks(triageResult.topics);

    let body = `# ${title}\n\n`;
    body += `${formattedContent}\n\n`;
    body += `${triageNotes}\n`;

    if (wikilinks) {
        body += `\n## Related\n\n${wikilinks}\n`;
    }

    // Generate filename
    const filename = generateFilename(seed.author, seed.content, seed.sourceId);

    // Determine directory based on status
    const directory =
        triageResult.status === 'approved'
            ? 'sources'
            : triageResult.status === 'archived'
                ? 'archive'
                : 'rejected';

    return {
        frontmatter,
        body,
        filename,
        directory,
    };
};

/**
 * Serialize a markdown document to a string
 */
export const serializeMarkdown = (doc: MarkdownDocument): string => {
    // Filter out undefined values from frontmatter
    const cleanedFrontmatter = Object.fromEntries(
        Object.entries(doc.frontmatter).filter(([_, value]) => value !== undefined)
    );

    return matter.stringify(doc.body, cleanedFrontmatter);
};
