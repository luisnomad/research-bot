import { z } from 'zod';
import { Ollama } from 'ollama';
import { OllamaService } from './ollama.js';
import { Seed } from '../ingestors/types.js';
import { getConfig } from '../config/index.js';

const ollama = new Ollama();

/**
 * Triage result schema
 */
export const TriageResultSchema = z.object({
    status: z.enum(['approved', 'archived', 'rejected']),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    topics: z.array(z.string()).optional().nullable(),
    isOutdated: z.boolean().optional().nullable(),
    isMisleading: z.boolean().optional().nullable(),
    factCheckDetail: z.string().optional().nullable(),
    needsReview: z.boolean().optional(), // True if confidence < 0.5
});

export type TriageResult = z.infer<typeof TriageResultSchema>;

/**
 * Service to handle LLM-based triage of ingested seeds.
 */
export const TriageService = {
    /**
     * Triage a single seed using the best available model.
     */
    async triageSeed(seed: Seed): Promise<TriageResult> {
        const model = await OllamaService.recommendModel('triage');
        if (!model) {
            throw new Error('No suitable model found for triage');
        }

        // 1. Optional Research Step
        // For X bookmarks or complex manual content, get internet context
        let researchContext = '';
        if (seed.source === 'x-bookmarks' || seed.content.join('').length > 100) {
            try {
                const { ResearchService } = await import('../services/research.js');
                // Use first part of content or URL as query
                const query = seed.content[0]?.substring(0, 100) || seed.url;
                researchContext = await ResearchService.researchClaim(query);
            } catch (error) {
                console.warn('Research failed, continuing triage without it');
            }
        }

        const prompt = this.generateTriagePrompt(seed, researchContext);

        try {
            const response = await ollama.chat({
                model,
                messages: [{ role: 'user', content: prompt }],
                format: 'json',
                options: {
                    temperature: 0.1, // Low temperature for consistent classification
                },
            });

            const content = response.message.content;
            const parsed = JSON.parse(content);
            const result = TriageResultSchema.parse(parsed);

            // Flag low-confidence items for manual review
            if (result.confidence < 0.5) {
                result.needsReview = true;
            }

            return result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Triage failed for seed ${seed.sourceId}: ${errorMsg}`);
            return {
                status: 'archived',
                confidence: 0.5,
                reason: `Triage error: ${errorMsg}`,
                needsReview: true, // Errors always need review
            };
        }
    },

    /**
     * Generate the triage prompt for the LLM.
     */
    generateTriagePrompt(seed: Seed, researchContext: string = ''): string {
        const contentStr = seed.content.join('\n---\n');
        const researchText = researchContext
            ? `\nINTERNET RESEARCH CONTEXT:\n${researchContext}\n`
            : '';

        return `
You are an expert information analyst for a personal knowledge base system.

IMPORTANT CONTEXT:
- The user BOOKMARKED this content, meaning they found it interesting and worth saving
- Your job is NOT to reject content, but to categorize and flag potential issues
- Be PERMISSIVE by default - only reject obvious spam, scams, or deliberate misinformation

CONTENT SOURCE: ${seed.source}
AUTHOR: ${seed.author || 'Unknown'}
URL: ${seed.url}
CONTENT:
${contentStr}
${researchText}

EVALUATION CRITERIA:

1. QUALITY: Is this spam, bot content, or engagement bait?
   - Personal opinions and commentary are VALID
   - Social media posts are often subjective - this is NORMAL
   - Only flag if it's clearly spam or zero-value content

2. ACCURACY: Is this a known scam, fake news, or deliberate misinformation?
   - Opinions and hot takes are NOT misinformation
   - Unverified claims are OK (we'll research them later)
   - Only flag if provably false or a known scam

3. RELEVANCE: Is this severely outdated?
   - Only flag if discussing old tech as if it's current (e.g., "React 16 is the latest")
   - Historical context or retrospectives are VALID

4. VALUE: Does this warrant further research or processing?
   - If the user bookmarked it, assume YES unless obviously worthless

DECISION RULES:
- "approved": Default choice. Content is worth keeping and processing.
- "archived": Content is outdated or superseded, but has historical value.
- "rejected": ONLY for spam, scams, or deliberate misinformation. Use sparingly.

CONFIDENCE LEVELS:
- High (0.8-1.0): Clear decision, no ambiguity
- Medium (0.5-0.79): Reasonable decision, some uncertainty
- Low (0.0-0.49): Uncertain, needs manual review

Response MUST be a valid JSON object with this structure:
{
  "status": "approved" | "archived" | "rejected",
  "confidence": 0.0 to 1.0,
  "reason": "Short explanation of the decision",
  "topics": ["topic1", "topic2"],
  "isOutdated": boolean,
  "isMisleading": boolean,
  "factCheckDetail": "If rejected or misleading, why?"
}
`;
    },

    /**
     * Triage a batch of seeds from the database.
     */
    async runBatchTriage(db: any, limit: number = 10) {
        const rows = db.prepare(`
      SELECT * FROM seeds 
      WHERE triage_status = 'pending' 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(limit) as any[];

        const results = {
            approved: 0,
            archived: 0,
            rejected: 0,
            needsReview: 0,
            errors: 0,
        };

        if (rows.length === 0) {
            return results;
        }

        for (const row of rows) {
            const seed: Seed = {
                source: row.source,
                sourceId: row.source_id,
                url: row.url,
                author: row.author,
                content: JSON.parse(row.content),
                isThread: row.is_thread === 1,
                hasImages: row.has_images === 1,
                extractedAt: row.extracted_at,
                metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            };

            try {
                const result = await this.triageSeed(seed);
                const config = getConfig();

                // Update database
                db.prepare(`
          UPDATE seeds 
          SET triage_status = ?,
              triage_confidence = ?,
              triage_reason = ?,
              triage_decided_by = ?,
              triage_at = ?,
              triage_topics = ?
          WHERE id = ?
        `).run(
                    result.status,
                    result.confidence,
                    result.reason,
                    config.ollama.model,
                    new Date().toISOString(),
                    result.topics ? JSON.stringify(result.topics) : null,
                    row.id
                );

                // Track results
                if (result.status === 'approved') results.approved++;
                else if (result.status === 'archived') results.archived++;
                else if (result.status === 'rejected') results.rejected++;

                if (result.needsReview) {
                    results.needsReview++;
                }
            } catch (error) {
                results.errors++;
            }
        }

        return results;
    },
};
