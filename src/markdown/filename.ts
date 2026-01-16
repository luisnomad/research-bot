/**
 * File Naming Utility
 *
 * Generates clean, URL-safe filenames for markdown files.
 */

/**
 * Convert a string to a URL-safe slug
 */
export const slugify = (text: string): string => {
    return text
        .toLowerCase()
        .trim()
        // Remove special characters
        .replace(/[^\w\s-]/g, '')
        // Replace whitespace with hyphens
        .replace(/\s+/g, '-')
        // Remove multiple consecutive hyphens
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '');
};

/**
 * Truncate text to a maximum length, breaking at word boundaries
 */
export const truncateAtWord = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
        return text;
    }

    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    // If we found a space, break there; otherwise just truncate
    return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
};

/**
 * Extract a meaningful title from content
 */
export const extractTitle = (content: readonly string[], maxLength = 60): string => {
    if (content.length === 0) {
        return 'untitled';
    }

    // Use the first part of content
    const firstPart = content[0];
    if (!firstPart) {
        return 'untitled';
    }

    // Remove URLs and mentions
    const cleaned = firstPart
        .replace(/https?:\/\/\S+/g, '')
        .replace(/@\w+/g, '')
        .trim();

    // Truncate at word boundary
    return truncateAtWord(cleaned, maxLength);
};

/**
 * Generate a filename for a markdown file
 *
 * Format: {author}-{content-slug}.md
 * Example: victormustar-local-llms-vs-cloud-privacy.md
 */
export const generateFilename = (
    author: string | undefined,
    content: readonly string[],
    sourceId: string
): string => {
    // Clean author handle (remove @ if present)
    const authorSlug = author ? slugify(author.replace(/^@/, '')) : 'unknown';

    // Extract and slugify content title
    const title = extractTitle(content);
    const contentSlug = slugify(title);

    // Combine author and content, limit total length
    const baseFilename = contentSlug
        ? `${authorSlug}-${contentSlug}`
        : `${authorSlug}-${sourceId.slice(0, 8)}`;

    // Ensure filename isn't too long (max 100 chars before extension)
    const truncated = baseFilename.slice(0, 100);

    return `${truncated}.md`;
};

/**
 * Handle filename collisions by appending a counter
 */
export const resolveFilenameCollision = (
    baseFilename: string,
    existingFilenames: Set<string>
): string => {
    if (!existingFilenames.has(baseFilename)) {
        return baseFilename;
    }

    // Extract name and extension
    const lastDot = baseFilename.lastIndexOf('.');
    const name = lastDot > 0 ? baseFilename.slice(0, lastDot) : baseFilename;
    const ext = lastDot > 0 ? baseFilename.slice(lastDot) : '';

    // Try appending numbers until we find an available name
    let counter = 2;
    let candidate = `${name}-${counter}${ext}`;

    while (existingFilenames.has(candidate)) {
        counter++;
        candidate = `${name}-${counter}${ext}`;
    }

    return candidate;
};
