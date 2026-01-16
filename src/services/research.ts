/**
 * Research Service
 *
 * Provides internet search capabilities via Brave Search and CDP.
 * Following functional-style service pattern used in the project.
 */

import {
    findOrGetFirstTab,
    connectToTab,
    navigateTo,
    evaluate,
    checkCDPConnection,
} from '../ingestors/common/cdp-client.js';
import { DEFAULT_CDP_CONFIG } from '../ingestors/common/cdp-client.js';

/**
 * Result from a research search
 */
export interface ResearchResult {
    readonly title: string;
    readonly url: string;
    readonly description: string;
}

/**
 * Service to handle internet research tasks.
 */
export const ResearchService = {
    /**
     * Search Brave for a query and return snippet results.
     * Uses an existing Chrome tab via CDP.
     */
    async search(query: string, limit: number = 5): Promise<readonly ResearchResult[]> {
        const cdpConfig = DEFAULT_CDP_CONFIG;

        try {
            // 1. Ensure CDP is available
            await checkCDPConnection(cdpConfig);

            // 2. Find or get a tab
            const tab = await findOrGetFirstTab(undefined, cdpConfig);
            const session = await connectToTab(tab);

            try {
                // 3. Navigate to Brave Search
                const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
                console.log(`Navigating to: ${searchUrl}`);
                await navigateTo(session, searchUrl);

                const resultsStr = await evaluate<string>(
                    session,
                    `
                    JSON.stringify((() => {
                        try {
                            const snippets = Array.from(document.querySelectorAll('.snippet'));
                            const realSnippets = snippets.filter(s => s.querySelector('a.l1'));
                            
                            if (realSnippets.length === 0) {
                                return {
                                    error: 'No real snippets found',
                                    totalSnippets: snippets.length,
                                    htmlSample: document.body.innerHTML.substring(0, 500)
                                };
                            }

                            return realSnippets.slice(0, ${limit}).map(s => {
                                const titleEl = s.querySelector('.title.search-snippet-title') || s.querySelector('a.l1');
                                const linkEl = s.querySelector('a.l1');
                                const descEl = s.querySelector('.content') || s.querySelector('.snippet-content') || s.querySelector('.snippet-description');
                                
                                return {
                                    title: titleEl ? titleEl.innerText.trim() : 'No Title',
                                    url: linkEl ? linkEl.href : '',
                                    description: descEl ? descEl.innerText.trim() : ''
                                };
                            });
                        } catch (e) {
                            return { error: e.message };
                        }
                    })())
                `
                );

                const results = resultsStr ? JSON.parse(resultsStr) : null;

                if (results && results.error) {
                    return [];
                }

                return (results as ResearchResult[]) || [];




            } finally {
                session.close();
            }
        } catch (error) {
            return [];
        }
    },

    /**
     * Research a specific claim or topic to get context for triage.
     */
    async researchClaim(claim: string): Promise<string> {
        const results = await this.search(claim, 3);
        if (results.length === 0) {
            return 'No search results found.';
        }

        return results
            .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.description}`)
            .join('\n\n');
    },
};
