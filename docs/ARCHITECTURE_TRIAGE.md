# Phase 1.4: Triage Architecture

## Overview

The **Triage phase** is the critical validation layer between ingestion and storage. It uses a local LLM to evaluate extracted seeds and decide their fate: approved for processing, archived as outdated, or rejected as misleading.

## Current State (January 2026)

### Database
- **61 seeds** extracted from X Bookmarks
- All in `pending` status
- Schema v2 with full triage support

### LLM Setup
- **Triage Model**: `llama3.2-vision:latest` (8/10 quality score)
- **Quick Tasks**: `locationbot-admin:latest` (9/10 speed score)
- **Embeddings**: Not yet pulled (need `nomic-embed-text`)
- **Service**: Ollama running locally

### Existing Code
- ✅ `src/llm/ollama.ts` - Model discovery and recommendation
- ✅ `src/llm/triage.ts` - Triage service with prompt generation
- ✅ `src/cli/test-triage.ts` - Single-seed test harness
- ✅ Database schema supports triage fields

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. SEEDS TABLE (61 pending items)                         │
│     source: 'x-bookmarks'                                   │
│     triage_status: 'pending'                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  2. TRIAGE SERVICE (LLM Evaluation)                         │
│     Model: llama3.2-vision:latest                           │
│     Prompt: 4 criteria (Novelty, Accuracy, Relevance,       │
│             Quality)                                        │
│     Output: JSON with status, confidence, reason            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. DECISION OUTCOMES                                       │
│     ├─ approved   → sources/                                │
│     ├─ archived   → archive/                                │
│     └─ rejected   → rejected/                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  4. DATABASE UPDATE                                         │
│     triage_status: 'approved' | 'archived' | 'rejected'     │
│     triage_confidence: 0.0 - 1.0                            │
│     triage_reason: "Short explanation"                      │
│     triage_decided_by: "llama3.2-vision:latest"             │
│     triage_at: ISO 8601 timestamp                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  5. MARKDOWN GENERATION (Phase 1.5)                         │
│     FOAM-compatible files with frontmatter                  │
│     Wikilinks for cross-referencing                         │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema (Triage Fields)

From `src/db/schema.ts` (lines 98-103):

```sql
-- Triage status
triage_status TEXT NOT NULL DEFAULT 'pending',  
  -- Values: pending, evaluating, approved, archived, rejected
triage_reason TEXT,
triage_confidence REAL,
triage_decided_by TEXT,  -- Model name that made the decision
triage_at TEXT,          -- ISO 8601 timestamp
```

**Indexes**:
- `idx_seeds_triage_status` on `triage_status` (for queue queries)

## Triage Criteria

The LLM evaluates seeds on **4 dimensions** (from `CLAUDE.md`):

1. **Novelty** - Does this add value vs existing knowledge?
   - Default: Assume yes (user pre-filtered by bookmarking)
   - Only reject if obviously junk

2. **Accuracy** - Are claims verifiable?
   - Critical for social media posts (X Bookmarks)
   - Flag known scams, fake news, hallucinations

3. **Relevance** - Is this outdated?
   - Old tech versions (e.g., "React 16 tutorial" in 2026)
   - Superseded tools (e.g., "Webpack vs Parcel" when Vite exists)

4. **Quality** - Is it actionable or just noise?
   - Spam detection
   - Low-effort content filtering

## Decision Rules

From `src/llm/triage.ts` (lines 83-86):

```typescript
- "approved": Content is high quality, accurate, and useful.
- "archived": Content is outdated or redundant but not necessarily "bad".
- "rejected": Content is fake, misleading, or low-quality spam.
```

## Triage Response Schema

Using Zod for validation (`src/llm/triage.ts`):

```typescript
{
  status: 'approved' | 'archived' | 'rejected',
  confidence: 0.0 - 1.0,
  reason: "Short explanation of the decision",
  topics: ["topic1", "topic2"],           // Optional
  isOutdated: boolean,                     // Optional
  isMisleading: boolean,                   // Optional
  factCheckDetail: "If rejected, why?"    // Optional
}
```

## Markdown Output Structure

Based on `FOAM_GUIDE.md` and `CLAUDE.md`:

### Approved → `sources/`

```markdown
---
source: x-bookmarks
source_id: "2011078287762825474"
author: "@victormustar"
url: https://x.com/victormustar/status/2011078287762825474
created: 2026-01-16
triaged: 2026-01-16
status: approved
confidence: 0.85
topics: [local-llms, privacy]
---

# [Tweet Title/First Line]

## Content

[Full tweet content, or thread parts separated by ---]

## Triage Notes

**Decision**: Approved  
**Confidence**: 85%  
**Reason**: High-quality discussion of local LLM privacy benefits

## Related

- [[local-llms]]
- [[privacy]]
```

### Archived → `archive/`

```markdown
---
source: x-bookmarks
archived_reason: "Outdated - React 16 tutorial, current version is 19"
archived_at: 2026-01-16
---

# [Title]

[Content preserved for reference]

## Why Archived

This content was archived because: Outdated - React 16 tutorial, current version is 19
```

### Rejected → `rejected/`

```markdown
---
source: x-bookmarks
rejected_reason: "Misleading - Claims local LLMs can't do X, but they can"
fact_check: "Verified with Ollama docs - local models support tool use"
rejected_at: 2026-01-16
---

# [Title]

[Content preserved for audit trail]

## Why Rejected

This content was rejected because: Misleading - Claims local LLMs can't do X, but they can

**Fact Check**: Verified with Ollama docs - local models support tool use
```

## File Naming Convention

Use URL-safe slugs based on:
1. Author + first 50 chars of content
2. Or source_id as fallback

Examples:
- `sources/victormustar-funny-how-you-can-do-the-same-thing.md`
- `archive/hackernoon-even-the-most-automated-ml-systems.md`
- `rejected/spam-2011078287762825474.md`

## Implementation Checklist

### Phase 1.4: Core Triage

- [x] Database schema with triage fields
- [x] Triage service with LLM integration
- [x] Test harness for single seed
- [ ] **Batch triage processor** (process all 61 seeds)
- [ ] **Update database with triage results**
- [ ] **Error handling and retry logic**
- [ ] **Progress tracking and logging**

### Phase 1.5: Markdown Generation

- [ ] Create `sources/`, `archive/`, `rejected/` directories
- [ ] Markdown template generator
- [ ] Frontmatter with `gray-matter`
- [ ] Wikilink generation
- [ ] File naming utility
- [ ] Write markdown files to disk

### Phase 1.6: Git Integration

- [ ] Auto-commit after batch processing
- [ ] Descriptive commit messages
- [ ] `simple-git` wrapper

## Testing Strategy

1. **Single Seed Test** (already exists)
   ```bash
   pnpm tsx src/cli/test-triage.ts
   ```

2. **Batch Test** (to implement)
   ```bash
   pnpm triage:batch --limit 10
   ```

3. **Full Import** (after validation)
   ```bash
   pnpm triage:all
   ```

## Performance Considerations

- **Rate**: ~2-5 seconds per seed (LLM inference time)
- **Batch Size**: Process 61 seeds = ~2-5 minutes total
- **Concurrency**: Single-threaded for now (Ollama handles one request at a time)
- **Future**: Add queue system for larger batches

## Integration with Phase 1.9 (Research Service)

The triage prompt can be enhanced with fact-checking:

```typescript
// Future enhancement
const researchResults = await ResearchService.factCheck(seed);
const enhancedPrompt = this.generateTriagePrompt(seed, researchResults);
```

This allows the LLM to validate claims against web search results.

## Error Handling

From `src/llm/triage.ts` (lines 51-58):

```typescript
catch (error) {
    console.error(`Triage failed for seed ${seed.sourceId}:`, error);
    return {
        status: 'archived',
        confidence: 0.5,
        reason: `Triage error: ${error.message}`,
    };
}
```

**Strategy**: On error, default to `archived` (safe fallback, not rejected).

## Next Steps

1. ✅ **Document architecture** (this file)
2. **Implement batch processor** (`src/cli/triage-batch.ts`)
3. **Test on 10 seeds** (validate decisions)
4. **Review LLM outputs** (adjust prompt if needed)
5. **Process all 61 seeds**
6. **Move to Phase 1.5** (markdown generation)

---

**Last Updated**: 2026-01-16  
**Status**: Architecture documented, ready for batch implementation
