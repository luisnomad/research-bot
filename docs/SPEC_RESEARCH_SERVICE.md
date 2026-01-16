# Research & Fact-Checking Architecture

## Overview

To overcome the "knowledge cut-off" of local LLMs, we implement an **Agentic Research** phase during triage. This allows the system to verify claims (especially from social media) using live internet data without requiring expensive third-party search APIs.

## The "CDP-Search" Workflow

Instead of giving the LLM raw HTML or direct internet access, we use a structured multi-step process:

### 1. Verification Decision (Reasoning)
The Triage LLM identifies if the content contains verifiable claims that are outside its training data.
- **Input**: Ingested Seed content.
- **Output**: `needs_research: boolean` + `search_query: string`.

### 2. Chrome CDP Search Execution
The system uses the existing Chrome CDP connection to perform the search.
- **Target**: `https://search.brave.com/search?q={query}`
- **Reason**: Brave Search has a simple, stable DOM and doesn't require API keys or accounts.

### 3. Structural Normalization (The "Janitor" Phase)
We separate the **Browsing** from the **Reasoning** to protect the LLM's context window:
- **Search Snippets**: A Node.js utility extracts just Title + Snippet + URL from the search results via CSS selectors.
- **Deep Dive (Optional)**: If snippets are insufficient, use `@extractus/article-extractor` to get clean plain text from a specific URL.
- **LLM View**: The model only ever receives structured text or clean Markdown.

### 4. Final Fact-Check
The LLM receives the original content + the research context.
- **Update**: Assigns `isOutdated`, `isMisleading`, and provides `factCheckDetail`.

## Advantages

1.  **Context Efficiency**: Small local models (3.2B/7B) don't get overwhelmed by HTML boilerplate.
2.  **Privacy/Cost**: No external API calls to OpenAI/Perplexity. Search happens through the user's logged-in Chrome instance.
3.  **Accuracy**: Drastically reduces hallucinations for recent technical updates or news.

## Technical Implementation

- **Tooling**: Chrome CDP, CSS Selectors for Brave Search, `@extractus/article-extractor`. 
- **Optional Helper**: [Vercel Agent Browser](https://github.com/vercel-labs/agent-browser) can be used to simplify browser interactions and snapshotting if complex navigation is required.
- **Latency**: Estimated +5-10s per research item.
