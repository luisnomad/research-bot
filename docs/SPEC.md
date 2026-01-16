# Knowledge Base Intelligence System - Technical Specification

## Overview

An automated system that processes Raindrop.io bookmarks into a searchable, interconnected Foam knowledge base using local LLMs via Ollama. The system continuously ingests, analyzes, cross-references, and synthesizes information while generating publication-ready content.

## Architecture

```
Raindrop.io (bookmarks)
    ↓
Local Server (Python FastAPI)
    ↓
Ollama (qwen2.5 or llama3.3)
    ↓
Foam Knowledge Base (Markdown + Git)
    ↓
Telegram Bot (query interface)
```

## System Components

### 1. Raindrop Ingestion Service
- **Purpose**: Fetch new bookmarks from Raindrop.io API
- **Frequency**: Continuous polling (every 15 minutes) or webhook-based
- **Output**: Raw bookmark metadata (URL, title, tags, description, date)
- **Storage**: SQLite queue for processing

### 2. Content Extraction Service
- **Purpose**: Fetch and extract clean content from URLs
- **Methods**: 
  - Web scraping (BeautifulSoup4, trafilatura)
  - Article extraction (newspaper3k, readability)
  - Fallback: Screenshot + OCR for complex pages
- **Output**: Clean text, metadata, images
- **Storage**: `sources/` directory with unique IDs

### 3. AI Processing Engine
- **Model**: Ollama (qwen2.5-14b or llama3.3-70b)
- **Tasks**:
  - Summarization (key insights, quotes)
  - Entity extraction (people, technologies, companies)
  - Topic classification (AI, testing, frontend, etc.)
  - Sentiment analysis
  - Technical level assessment
- **Output**: Structured markdown with frontmatter

### 4. Cross-Reference System
- **Purpose**: Find connections between bookmarks
- **Methods**:
  - Semantic similarity (sentence-transformers via Ollama embeddings)
  - Entity overlap
  - Topic co-occurrence
  - Citation detection
- **Output**: Wikilinks `[[topic-name]]` in markdown

### 5. Topic Clustering Service
- **Purpose**: Discover emerging topics from multiple bookmarks
- **Algorithm**: HDBSCAN on embeddings + LLM naming
- **Triggers**: 
  - 5+ bookmarks with high similarity
  - Manual trigger via Telegram
- **Output**: `topics/` markdown files with statistics

### 6. Synthesis Engine
- **Purpose**: Generate weekly summaries and insights
- **Schedule**: Weekly (Sundays at 22:00)
- **Process**:
  1. Aggregate week's bookmarks
  2. Identify trends (rising/declining topics)
  3. Find contradictions or debates
  4. Generate content ideas
  5. Calculate statistics
- **Output**: `syntheses/weekly-YYYY-MM-DD.md`

### 7. Content Generation System
- **Purpose**: Create publication-ready drafts
- **Types**:
  - LinkedIn posts (150-300 words)
  - LinkedIn carousels (10 slides)
  - Blog posts (1000-2000 words)
  - Twitter threads
- **Input**: Topics, syntheses, user prompts
- **Output**: `drafts/` with frontmatter metadata

### 8. Fact-Checking Module
- **Purpose**: Verify claims and remove outdated info
- **Methods**:
  - Cross-reference claims across multiple sources
  - Check publication dates
  - Flag single-source claims
  - Detect contradictions
- **Output**: Confidence scores in frontmatter

### 9. Git Automation
- **Purpose**: Version control all changes
- **Triggers**: 
  - After each bookmark processing
  - After synthesis generation
  - Daily consolidation commit
- **Format**: Descriptive commit messages with stats

### 10. Telegram Bot Interface
- **Purpose**: Query and control the system
- **Commands**:
  - `/search <query>` - Semantic search
  - `/topics` - List all topic clusters
  - `/summary [topic]` - Get topic summary
  - `/weekly` - Latest synthesis
  - `/generate <type> <topic>` - Create content draft
  - `/stats` - System statistics
  - `/process` - Force bookmark processing
  - `/status` - Show queue status (pending, triage, processing, failed)
  - `/triage <bookmark_id>` - Manually review triage decision
  - `/archive <bookmark_id>` - Manually archive a bookmark
  - `/rejected` - Show recently rejected bookmarks
- **Features**: Inline previews, markdown rendering, status updates

## Data Models

### Storage Strategy: Hybrid (SQLite + Markdown)

**Question**: Can we rely on markdown alone, or do we need a database?

**Answer**: **Hybrid approach** - SQLite for queue management and search indices, markdown as source of truth.

**Why SQLite is needed**:
- Fast queue operations (status transitions, filtering pending items)
- Efficient embedding storage for semantic search
- Quick statistics queries ("how many in triage?", "processing failures?")
- Transaction safety for status updates
- No need to parse 1000+ markdown files for simple queries

**Why Markdown remains primary**:
- Human-readable source of truth
- Git versioning (see what changed)
- Portable (works without database)
- Can regenerate database from markdown if needed
- Foam compatibility

**Data Flow**: 
```
Raindrop → SQLite (queue + status) → Processing → Markdown (output) → SQLite (update status + embedding)
```

If markdown and SQLite disagree, markdown wins. SQLite is cache/index.

### Bookmark Record (SQLite)
```sql
CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY,
    raindrop_id INTEGER UNIQUE,
    url TEXT,
    title TEXT,
    description TEXT,
    tags TEXT, -- JSON array
    created_at TIMESTAMP,
    
    -- Status tracking
    status TEXT NOT NULL, -- e.g. 'triage_pending', 'queue_processing', 'active'
    status_reason TEXT,
    status_timestamp TIMESTAMP,
    status_confidence FLOAT,
    
    -- Processing metadata
    processed_at TIMESTAMP,
    markdown_path TEXT,
    embedding BLOB, -- Vector for semantic search
    
    -- Retry tracking
    retry_count INTEGER DEFAULT 0,
    last_error TEXT
);

CREATE INDEX idx_status ON bookmarks(status);
CREATE INDEX idx_created_at ON bookmarks(created_at);
CREATE INDEX idx_raindrop_id ON bookmarks(raindrop_id);
```

### Markdown Frontmatter (Standard)
```yaml
---
raindrop_id: 12345
url: https://example.com/article
title: Article Title
created: 2026-01-13T10:00:00Z
processed: 2026-01-13T10:15:00Z

# Status tracking
status: active  # or triage_*, queue_*, archived, rejected
status_reason: null  # Reason for archive/rejection
status_confidence: 0.85

# Classification
tags: [ai, agents, production]
topics: [llm-context-management, production-ai-systems]

# Quality metrics
confidence: 0.85
fact_checked: true
sources_count: 3
---
```

### Status Files (for triaged/rejected items)

For archived or rejected items, markdown is still created but stored in specific subdirectories:

**Archived**: `archive/rdp-{id}.md`
```yaml
---
raindrop_id: 12345
status: triage_archived_outdated
status_reason: "Discusses Webpack 4, now at Webpack 5 with major changes"
status_timestamp: 2026-01-13T10:30:00Z
better_alternative: "https://webpack.js.org/migrate/5/"
excerpt: "Quick summary of what bookmark was about"
---

# [Archived] Article Title

**Why Archived**: Discusses Webpack 4, now at Webpack 5 with major changes  
**Better Alternative**: https://webpack.js.org/migrate/5/

## Original Summary
[Brief excerpt]
```

**Rejected**: `rejected/rdp-{id}.md`
```yaml
---
raindrop_id: 12345
status: triage_rejected_misrepresented
status_reason: "X post claims 'Claude 4 released' but source only mentions research directions"
status_timestamp: 2026-01-13T10:30:00Z
fact_check_details: "Anthropic blog post discusses long-term research, no product announcement"
---

# [Rejected] Misleading Post About Claude 4

**Why Rejected**: Claims don't match source material  
**Claim**: "Claude 4 released with 10M context"  
**Reality**: Research blog post about future directions, no release

## Fact Check
[Details]
```

This allows searching rejected items later ("what was that fake news about X?").

### Topic Cluster Metadata
```yaml
---
cluster_id: llm-context-management
created: 2026-01-10
updated: 2026-01-13
bookmarks_count: 15
avg_confidence: 0.82
related_topics: [rag-systems, vector-databases]
trend: rising
---
```

## Directory Structure

```
knowledge-base/
├── sources/           # Processed bookmarks (status: active)
│   ├── rdp-12345.md
│   ├── rdp-12346.md
├── archive/           # Archived bookmarks (outdated/superseded)
│   ├── rdp-11111.md   # With status_reason in frontmatter
│   ├── rdp-11112.md
├── rejected/          # Rejected bookmarks (fake/incorrect/misrepresented)
│   ├── rdp-10001.md   # With fact-check details
│   ├── rdp-10002.md
├── topics/            # Topic clusters (AI-discovered)
│   ├── llm-context-management.md
│   ├── playwright-testing.md
├── syntheses/         # Weekly summaries
│   ├── weekly-2026-01-13.md
│   ├── weekly-2026-01-20.md
├── drafts/            # Publication-ready content
│   ├── linkedin-agent-production.md
│   ├── blog-playwright-migration.md
├── journal/           # Daily notes (manual)
├── .system/           # System files (not in Foam view)
│   ├── bookmarks.db   # SQLite database (queue + status tracking)
│   ├── embeddings.db  # Vector database (optional separate file)
│   ├── config.yaml    # System configuration
│   └── logs/          # Log files
│       ├── triage.log
│       ├── processing.log
│       └── errors.log
└── index.md           # Entry point
```

## Onboarding Process

When the system first runs, it must process ALL existing Raindrop bookmarks through a triage system:

### Triage Queue (for bookmarks older than 2 months)

1. **Relevance Check**: AI determines if content is still relevant
   - Check if discussing old versions/deprecated tech
   - Check if better alternatives exist now
   - Check if information is outdated
   
2. **Decision Tree**:
   ```
   Is bookmark > 2 months old?
     YES → Triage evaluation
       ├─ Still relevant? → Process queue
       ├─ Outdated? → Archive (status: archived_outdated)
       ├─ Better alternatives exist? → Archive (status: archived_superseded)
       └─ Historical value only? → Archive (status: archived_historical)
     NO → Process queue directly
   ```

3. **Fact-Checking** (for triaged items marked relevant):
   - Extract claims from content
   - Cross-reference with source material
   - For X/Twitter posts: verify claims against linked sources
   - Check for exaggerations or misrepresentations
   - Detect debunked information
   
4. **Triage Outcomes**:
   - `triage_approved` → Move to processing queue
   - `triage_archived_outdated` → Archive, note why
   - `triage_archived_superseded` → Archive, note better alternative
   - `triage_archived_historical` → Archive, note historical context only
   - `triage_rejected_fake` → Discard, claims debunked
   - `triage_rejected_incorrect` → Discard, factually wrong
   - `triage_rejected_misrepresented` → Discard, source doesn't support claims

### Bookmark Status System

Every bookmark has a status field tracking its lifecycle:

**Triage Statuses** (onboarding only):
- `triage_pending` - Awaiting triage evaluation
- `triage_evaluating` - Currently being triaged by AI
- `triage_approved` - Cleared for processing
- `triage_archived_*` - Archived with reason
- `triage_rejected_*` - Rejected with reason

**Processing Statuses**:
- `queue_pending` - In processing queue
- `queue_extracting` - Fetching content
- `queue_processing` - AI analysis in progress
- `queue_failed` - Processing failed (will retry)
- `processed` - Successfully processed
- `processing_error` - Permanent failure (logged)

**Final Statuses**:
- `active` - Processed and in knowledge base
- `archived` - Stored but marked as outdated/superseded
- `rejected` - Discarded (fake/incorrect/misrepresented)

### Status Metadata

Each status includes metadata:
```yaml
status: triage_archived_outdated
status_reason: "Discusses React 16 hooks, now at React 19"
status_decided_by: ollama_qwen2.5
status_timestamp: 2026-01-13T10:30:00Z
status_confidence: 0.92
```

For rejected items:
```yaml
status: triage_rejected_misrepresented
status_reason: "X post claims 'GPT-5 released' but source only mentions research paper"
status_fact_check: "Source (OpenAI blog) confirms no GPT-5 release, only safety research"
status_decided_by: ollama_qwen2.5
status_timestamp: 2026-01-13T10:30:00Z
```

## Processing Pipeline

### Initial Onboarding Flow
1. Fetch ALL bookmarks from Raindrop.io
2. Sort by date (oldest first for triage)
3. For bookmarks > 2 months old:
   - Add to triage queue
   - AI evaluates relevance
   - Fact-check approved items
   - Assign status with reason
4. For recent bookmarks (< 2 months):
   - Skip triage, add directly to processing queue
5. Track progress: "Processed 450/1247 bookmarks (triage: 892, approved: 450, archived: 380, rejected: 62)"

### Bookmark Ingestion Flow (ongoing, after onboarding)
1. Raindrop service fetches new bookmarks
2. Add to processing queue with status `queue_pending` (skip triage for new items)
3. Content extractor fetches URL content → `queue_extracting`
4. AI processes content (summary, entities, topics) → `queue_processing`
5. Cross-reference system finds related notes
6. Generate markdown with wikilinks
7. Save to `sources/` directory
8. Update status to `processed` then `active`
9. Git commit changes
10. Check if topic clustering needed

### Topic Clustering Flow
1. Triggered by N new bookmarks in similar domain
2. Calculate embeddings for recent bookmarks
3. Run HDBSCAN clustering
4. For each cluster:
   - LLM generates cluster name and description
   - Calculate statistics (size, trend, confidence)
   - Find representative bookmarks
   - Create/update `topics/*.md` file
5. Update wikilinks in source bookmarks
6. Git commit

### Weekly Synthesis Flow
1. Triggered every Sunday 22:00
2. Aggregate last 7 days of bookmarks
3. Group by topics
4. Analyze trends:
   - Topic frequency over time
   - New topics discovered
   - Declining topics
5. LLM generates:
   - Executive summary
   - Hot topics breakdown
   - Content opportunities
   - Action items
6. Save to `syntheses/weekly-*.md`
7. Git commit
8. Send notification via Telegram

## Technology Stack

### Core
- **Python 3.11+**: Main language
- **FastAPI**: Web server for API and webhooks
- **SQLite**: Local database (bookmarks, metadata)
- **Ollama**: Local LLM inference

### NLP/ML
- **sentence-transformers**: Embeddings (via Ollama)
- **scikit-learn**: HDBSCAN clustering
- **numpy**: Vector operations

### Content Processing
- **trafilatura**: Article extraction
- **beautifulsoup4**: HTML parsing
- **readability-lxml**: Content extraction fallback
- **Pillow**: Image processing

### Integrations
- **httpx**: Async HTTP client
- **python-telegram-bot**: Telegram bot API
- **raindrop-io-py**: Raindrop API client (or custom with httpx)

### Development
- **pytest**: Testing
- **black**: Code formatting
- **mypy**: Type checking
- **poetry**: Dependency management

## Configuration

### Environment Variables
```bash
# Raindrop
RAINDROP_API_TOKEN=xxx

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b

# Telegram
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx

# System
KNOWLEDGE_BASE_PATH=/path/to/knowledge-base
GIT_AUTO_COMMIT=true
PROCESSING_INTERVAL=900  # seconds

# Embeddings
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
```

### config.yaml
```yaml
raindrop:
  poll_interval: 900
  batch_size: 10
  
ollama:
  base_url: "http://localhost:11434"
  model: "qwen2.5:14b"
  timeout: 120
  
processing:
  min_content_length: 500
  max_content_length: 50000
  extract_images: false
  
clustering:
  min_cluster_size: 5
  similarity_threshold: 0.75
  
synthesis:
  schedule: "0 22 * * SUN"
  lookback_days: 7
  
telegram:
  enabled: true
  commands_enabled: true
```

## Performance Requirements

- **Bookmark processing**: < 30 seconds per bookmark
- **Search latency**: < 2 seconds for semantic search
- **Synthesis generation**: < 5 minutes for weekly summary
- **Telegram response**: < 3 seconds for queries
- **Git operations**: Non-blocking background tasks

## Error Handling

### Retry Strategy
- Content extraction failures: 3 retries with exponential backoff
- Ollama timeouts: 2 retries, then queue for later
- API rate limits: Respect 429 responses, backoff appropriately

### Failure Modes
- **Content extraction fails**: Save metadata only, flag for manual review
- **Ollama unavailable**: Queue bookmarks, process when available
- **Clustering fails**: Log error, continue with manual topics
- **Git conflicts**: Auto-resolve or alert user via Telegram

## Security & Privacy

- All processing happens locally (no cloud LLMs)
- Raindrop token stored in environment variables
- Telegram bot restricted to specific chat IDs
- Git repository can be private
- No telemetry or external logging

## Monitoring & Observability

### Metrics to Track
- Bookmarks processed per day
- Processing time per bookmark
- Ollama token usage
- Storage growth rate
- Topic cluster count over time
- Failed processing attempts

### Logs
```
logs/
├── ingestion.log      # Raindrop polling
├── processing.log     # Bookmark processing
├── synthesis.log      # Weekly summaries
└── telegram.log       # Bot interactions
```

## Future Enhancements (Phase 2)

- Web UI dashboard for visualization
- Multi-user support (family/team knowledge base)
- Export to Obsidian Publish / GitHub Pages
- Automatic POC code generation from technical bookmarks
- Integration with other sources (Pocket, Instapaper, Twitter bookmarks)
- Voice interface via Telegram voice messages
- Mobile app for quick capture
- AI-powered reading recommendations

## Success Metrics

- 90%+ of bookmarks successfully processed
- 5+ topic clusters discovered per week
- 1+ publication-ready draft generated per week
- < 5 minutes daily maintenance required
- Knowledge base searchable and useful after 1 month

## Dependencies & Installation

See `requirements.txt` and `setup.py` for detailed dependencies.

Quick start:
```bash
poetry install
poetry run python -m knowledge_system.server
```

## Development Workflow

1. All code in `knowledge_system/` module
2. Tests in `tests/`
3. Configuration in `.env` and `config.yaml`
4. Run locally: `poetry run uvicorn knowledge_system.server:app --reload`
5. Run tests: `poetry run pytest`
6. Format: `poetry run black .`

## License

MIT (Personal use)

---

**Version**: 1.0  
**Last Updated**: 2026-01-13  
**Author**: Luis
