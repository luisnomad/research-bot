# Knowledge Base System

## Purpose

Turn bookmarked content into a queryable knowledge base. Local-first, Git-versioned, LLM-powered.

**Core workflow**: Ingest → Triage (LLM validates/categorizes) → Process → Store as Foam-compatible markdown.

## Ingestion Sources

The system is designed for **multiple ingestion adapters**. Each source implements:
1. **Collection** - Gather items (URLs, seeds, metadata)
2. **Extraction** - Get full content for triage
3. **Deduplication** - Track what's already processed

### Active Sources

| Source | Status | Method | Notes |
|--------|--------|--------|-------|
| **X Bookmarks** | Complete | Chrome CDP | See `.claude/skills/x-bookmarks-cdp.md` |
| **Manual URL** | Complete | Telegram Bot | Article extraction via `@extractus/article-extractor` |

### Future Sources (Planned)

- RSS feeds
- YouTube watch-later
- GitHub stars
- Pocket

### Adding New Sources

Create adapter in `src/ingestors/` implementing:
```typescript
interface IngestorAdapter {
  name: string;
  collectItems(): Promise<IngestItem[]>;
  extractContent(item: IngestItem): Promise<Seed>;
  markProcessed(itemId: string): Promise<void>;
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    INGESTION LAYER                          │
│  [X Bookmarks] [Manual URL] [RSS] [YouTube] [GitHub] [...]  │
└─────────────────────────┬───────────────────────────────────┘
                          │ Seeds
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    TRIAGE (LLM)                             │
│  • Validate quality                                         │
│  • Categorize topics                                        │
│  • Fact-check (especially social media posts)               │
│  • Age relevance (is this outdated?)                        │
└─────────────────────────┬───────────────────────────────────┘
                          │ Approved / Archived / Rejected
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    PROCESSING                               │
│  • Discover related items (future: embeddings)               │
│  • Generate markdown with wikilinks                         │
│  • Automated Git versioning                                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    STORAGE (Markdown)                       │
│  sources/   → Active, useful content                        │
│  archive/   → Outdated/superseded (with reason)             │
│  rejected/  → Fake/misleading (with fact-check)             │
│  topics/    → AI-discovered clusters (future)                │
└─────────────────────────────────────────────────────────────┘
```

## Seed Format

All ingestion sources produce a normalized "seed" for triage:

```typescript
interface Seed {
  source: 'x-bookmarks' | 'manual' | 'rss' | string;
  sourceId: string;           // Unique ID within source
  url: string;
  author?: string;
  content: string[];          // For threads: array of parts
  isThread: boolean;
  hasImages: boolean;         // Flag only, no image processing
  extractedAt: string;
  metadata?: Record<string, unknown>;
}
```

## Triage Logic

The human has pre-filtered by bookmarking. LLM triage validates:

1. **Novelty** - Does this add value vs existing knowledge?
2. **Accuracy** - Are claims verifiable? (especially for social posts)
3. **Relevance** - Is this outdated? (old tech versions, superseded tools)
4. **Quality** - Is this actionable or just noise?

**Outcomes:**
- `approved` → Process and store in `sources/`
- `archived` → Store in `archive/` with reason
- `rejected` → Store in `rejected/` with fact-check details

## Tech Stack

- **Runtime**: Node v25+, TypeScript (strict)
- **LLM**: Ollama (local) - qwen2.5:14b, llama3.2-vision:latest
- **Database**: better-sqlite3 (queue, triage results)
- **Frontmatter**: gray-matter
- **Bot**: Grammy (Telegram)
- **Git**: simple-git (auto-commit changes)

## Key Design Decisions

1. **Markdown is source of truth** - SQLite is cache/index.
2. **Permissive Triage** - Trust the user's intent to bookmark; LLM only rejects obvious spam/fake.
3. **Rate limiting everywhere** - Respect platform limits, add jitter.
4. **Incremental processing** - Nightly pipeline + manual triggers.

## Bot Commands

```
/start             - Welcome and help
/status            - Database stats and system health
/today             - What was triaged and generated today
```

**Quick add:** Just send a URL (no command needed) → auto-queued for ingestion.

## Development Phases

1. **Phase 1 (Done)**: X Bookmarks + Manual URL + Orchestration + Bot
2. **Phase 2 (Current)**: Research/Fact-checking service + Embeddings
3. **Phase 3 (Planned)**: Weekly synthesis, cluster management, advanced content generation

## Operational Model

**Background process with night shifts + on-demand triggers:**

- **NIGHTLY**: 00:00 pipeline (Triage pending -> Generate Markdown -> Git Commit -> Notify).
- **ON-DEMAND**: `pnpm process:item <id>` or bot URL submission.

## Constraints

- Single-user system (Luis's personal KB)
- Mac Mini M4 32GB (Ollama runs locally)
- Optimize for correctness over speed
