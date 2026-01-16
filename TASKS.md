# Knowledge Base - Development Tasks

## Status Overview

| Phase | Status | Focus |
|-------|--------|-------|
| **Phase 0** | ✅ Done | X Bookmarks PoC validated |
| **Phase 1** | ✅ Done | MVP Pipeline + Bot |
| **Phase 2** | 🔄 Current | Additional sources, embeddings |
| **Phase 3** | ⏳ Planned | Clustering, synthesis, content generation |

---

## Phase 0: X Bookmarks PoC ✅

All validated. See `X_BOOKMARKS_CDP_SPEC.md` for details.

- [x] CDP connection via raw WebSocket (not Puppeteer)
- [x] Bookmark feed scrolling with rate limiting
- [x] URL collection (64 bookmarks extracted successfully)
- [x] Thread detection (consecutive same-author algorithm)
- [x] Truncation issue identified (feed vs direct view)
- [x] Two-phase extraction approach documented
- [x] Claude Skill created (`.claude/skills/x-bookmarks-cdp.md`)

---

## Phase 1: MVP - X Bookmarks to Knowledge Base

**Goal**: One working pipeline: X Bookmarks → Triage → Markdown

### 1.1 First Import (Onboarding)

One-time bulk import from an X Bookmarks folder:

```
User provides: https://x.com/i/bookmarks/1899171982010130843
System: Scrolls → Collects all URLs → Adds to queue
```

- [x] CLI command: `pnpm import:x <folder-url>`
- [ ] Bot command: `/import <folder-url>`
- [x] Scroll through folder, collect all bookmark URLs
- [x] Deduplicate against existing queue
- [ ] Add to SQLite queue with status `pending`
- [x] Report: "Imported 64 bookmarks, 12 already in queue"
- [ ] Resume support (if interrupted, continue from last position)

### 1.2 Ingestion Layer

```
x-bookmarks-poc/ → src/ingestors/x-bookmarks/
```

- [x] Create ingestion adapter interface (`IngestorAdapter`)
- [x] Port PoC to TypeScript with proper structure
- [x] Implement URL collection (used by First Import)
- [x] Implement full content extraction (Phase 2 of two-phase)
- [x] Add thread detection (port `detect-thread-v2.mjs`)
- [x] Produce normalized Seed objects
- [x] Track processed URLs (avoid reprocessing)

### 1.3 Database Layer

- [x] SQLite schema: `seeds`, `processing_log`, `extraction_state`
- [x] Store seeds with status tracking
- [x] Mark processed items
- [ ] Resume capability (last position, interrupted runs)

### 1.4 Triage (LLM)

- [x] Ollama client setup (ollama-js)
- [x] Triage prompt: validate claims, check novelty (permissive by default)
- [x] Parse structured response (Zod)
- [x] Status assignment: approved / archived / rejected
- [x] Store triage results with confidence + reason
- [x] Low-confidence flagging for manual review
- [x] Batch processor for multiple seeds
- [x] Tested on 10 seeds (100% approved, 95% avg confidence)

### 1.5 Markdown Generation

- [x] `sources/` template (active content)
- [x] `archive/` template (with reason)
- [x] `rejected/` template (with fact-check)
- [x] Frontmatter with gray-matter
- [x] Wikilinks format for Foam compatibility
- [x] File naming utility (author + content slug)
- [x] CLI command: `pnpm generate:markdown`
- [x] Test markdown generation on approved seeds (61 seeds generated)

### 1.6 Git Integration

- [x] Auto-commit after processing batch
- [x] Descriptive commit messages
- [x] simple-git wrapper

### 1.7 Orchestration ✅

- [x] Night processing scheduler (node-cron)
- [x] Queue management (batch processing)
- [x] Progress tracking (structured logging)
- [x] Error handling + retry logic (within orchestrator)
- [x] Telegram notifications on completion
- [x] On-demand processing (single item + topic)

### 1.8 Telegram Bot (Basic) ✅
 
- [x] Grammy setup
- [x] URL message handler → auto-queue
- [x] `/status` command
- [x] `/today` command
- [x] Notifications when feedback needed
- [x] Process management (PM2 config)

### 1.9 Intelligence: Research & Fact-Checking ✅ (2026-01-16)
 
- [x] Research Service: Implemented Brave Search via CDP in `ResearchService`.
- [x] Fact-Checking: Integrated research results into `TriageService` prompt.
- [x] CLI testing: `tsx src/cli/test-research.ts`
- [x] Robust extraction: Fixed CDP evaluation serialization and TypeScript issues.
 
---
 
## Phase 2: Multi-Source + Intelligence

### 2.1 Embedding & Semantic Search ✅ (2026-01-16)

- [x] Ollama nomic-embed-text integration
- [x] Embedding Service: Implemented `EmbeddingService` for vector generation.
- [x] Similarity calculation: Implemented cosine similarity for semantic matching.
- [x] Store in SQLite BLOB: Updated schema and operations to persist vectors.
- [x] Semantic search function: Tested end-to-end vector persistence and retrieval.

### 2.3 Cross-Referencing ✅ (2026-01-16)

- [x] Find related items via embeddings: Implemented in `OrchestratorService`.
- [x] Generate wikilinks automatically: Added to markdown generator.
- [x] Update markdown with related links: Included in standard generation pipeline.

### 2.4 Bot Enhancements ✅ (2026-01-16)

- [x] `/search` semantic search: Implemented with vector similarity.
- [ ] `/topics` list clusters
- [ ] On-demand commands (`/draft`, `/process`)

---

## Phase 3: Advanced Intelligence

### 3.1 Topic Clustering

- [ ] HDBSCAN on embeddings
- [ ] LLM names clusters
- [ ] Generate `topics/*.md`

### 3.2 Weekly Synthesis

- [ ] Sunday night generation
- [ ] Trend analysis
- [ ] `syntheses/weekly-*.md`

### 3.3 Content Generation

- [ ] LinkedIn post drafts
- [ ] Blog post drafts
- [ ] `/draft <topic>` command

### 3.4 Additional Sources

- [ ] RSS adapter
- [ ] YouTube watch-later adapter
- [ ] GitHub stars adapter

---

## Current Sprint

**Focus**: Phase 1.6 - Git Integration

### Phase 1.5 Completed ✅ (2026-01-16)

**Markdown Generation**: Fully implemented and tested

1. [x] Created markdown generation module (`src/markdown/`)
2. [x] Implemented FOAM-compatible frontmatter with gray-matter
3. [x] Built file naming utility with slug generation
4. [x] Created wikilink generation for topics
5. [x] Implemented markdown writer with directory structure
6. [x] Created CLI command `pnpm generate:markdown`
7. [x] Generated markdown for all 61 approved seeds
8. [x] Verified FOAM compatibility

**Results**:
- 61 markdown files generated in `knowledge/sources/`
- Clean, readable filenames (author-content-slug format)
- Proper frontmatter with all metadata
- Collision detection and resolution (5 files renamed)
- All files ready for FOAM/Obsidian

### Phase 1.6 Completed ✅ (2026-01-16)

**Git Integration**: Automated versioning for the knowledge base

1. [x] Created Git service using `simple-git`
2. [x] Implemented staging and committing logic
3. [x] Integrated Git auto-commits into `generate:markdown` CLI
4. [x] Added `--no-commit` flag for manual control
5. [x] Verified commit message format and automation

**Results**:
- New knowledge base entries are automatically versioned
- Commit messages include stats (count, status, date)
- Clean integration with existing generation pipeline

### Phase 1.7 Completed ✅ (2026-01-16)

**Orchestration**: Fully automated night processing pipeline

1. [x] Built `OrchestrationService` to chain triage and generation.
2. [x] Handled batch logic programmatically (removed CLI dependency).
3. [x] Integrated `node-cron` for midnight scheduling.
4. [x] Built `NotificationService` for Telegram status updates.
5. [x] Created `src/server.ts` entry point for long-lived execution.
6. [x] Added `pnpm nightly` for manual execution.

**Results**:
- The system can now run autonomously in the background.
- Success/failure reports are sent directly to Telegram.
- Clean separation between CLI tools and core services.

### Phase 1.8 Completed ✅ (2026-01-16)
 
**Telegram Bot**: Interactive bot with commands and auto-queueing.

1. [x] Built the Grammy bot integration.
2. [x] Implemented `/status` and `/today` commands.
3. [x] Built `UrlIngestorService` for manual URL queueing.
4. [x] Integrated bot into `server.ts`.
5. [x] Updated `NotificationService` to share the bot instance.

**Results**:
- System can be monitored and controlled via Telegram.
- New knowledge can be added instantly by sending URLs to the bot.
- Reports now include a "Review Required" flag for low-confidence triage.

### Next Tasks - Phase 1.9 & Phase 2.1

### Future Tasks

- ✅ Ollama running with llama3.2-vision:latest

---

## Operational Notes

**Processing model**: Night shifts + on-demand

```
DAYTIME:  Poll once, queue items, respond to user triggers
NIGHT:    Process queue, run expensive operations, commit
ON-DEMAND: /draft, /process, /refresh triggered by user
```

**Rate limiting**: Always add jitter, respect both X and Chrome limits.

**Testing**: Focus on integration tests with real data, not mocking everything.

---

## Tech Decisions

- **TypeScript strict mode**, no `any`
- **Zod** for all external data validation
- **Functional style** (no classes, pure functions where possible)
- **pnpm** for package management
- **Jest** for testing
- **Markdown is source of truth**, SQLite is cache

---

## What This Is NOT

- Production-grade system
- Multi-user
- Real-time
- Over-engineered

## What This IS

- Luis's personal knowledge system
- Background processor with night shifts
- Local-first, Git-versioned
- Iteratively developed
