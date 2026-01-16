# Knowledge Base Intelligence System

Turn bookmarked content into a queryable knowledge base. Local-first, Git-versioned, LLM-powered.

**Current Status**: Phase 1 (MVP) - X Bookmarks → Triage → Storage

## Key Features

- **Multi-Source Ingestion**: X (Twitter) Bookmarks (active), Raindrop.io (planned), RSS, YouTube, GitHub
- **Intelligent Triage**: LLM validates content, fact-checks claims, archives outdated material
- **Automated Processing**: Extracts and summarizes content automatically
- **Topic Discovery**: Discovers topic clusters via embeddings
- **Cross-Referencing**: Links related content using wikilinks
- **Weekly Syntheses**: Generates weekly summaries
- **Content Generation**: Creates publication-ready drafts (LinkedIn, blogs)
- **Telegram Bot**: Query your knowledge base via Telegram
- **Local & Private**: All processing happens locally with Ollama, no cloud LLMs

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Server**: Fastify
- **Database**: better-sqlite3
- **LLM**: Ollama (qwen2.5:14b or llama3.3)
- **Bot**: Grammy (Telegram)
- **Testing**: Jest
- **Package Manager**: pnpm

## Prerequisites

1. **Node.js 20+**: Install from [nodejs.org](https://nodejs.org/)
2. **pnpm**: Install with `npm install -g pnpm`
3. **Ollama**: Install from [ollama.ai](https://ollama.ai/)
4. **Raindrop.io API Token**: Get from [app.raindrop.io/settings/integrations](https://app.raindrop.io/settings/integrations)
5. **(Optional) Telegram Bot Token**: Get from [@BotFather](https://t.me/botfather)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Install Ollama Models

```bash
ollama pull qwen2.5:14b
ollama pull nomic-embed-text
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
RAINDROP_API_TOKEN=your_raindrop_api_token_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here  # Optional
TELEGRAM_ALLOWED_CHAT_IDS=your_chat_id_here       # Optional
```

### 4. Run Onboarding (First Time)

Process all existing Raindrop bookmarks with intelligent triage:

```bash
pnpm onboard
```

This will:
- Fetch ALL bookmarks from Raindrop
- Triage old bookmarks (>2 months) for relevance
- Fact-check claims against sources
- Archive outdated content
- Reject fake/misleading posts
- Process recent bookmarks normally

### 5. Start Continuous Processing

After onboarding, run the server for ongoing processing:

```bash
pnpm dev
```

### 6. (Optional) Start Telegram Bot

```bash
pnpm bot
```

## Project Structure

```
knowledge-base/
├── sources/          # Active bookmarks (processed & relevant)
├── archive/          # Outdated/superseded bookmarks
├── rejected/         # Fake/misleading bookmarks
├── topics/           # AI-discovered topic clusters
├── syntheses/        # Weekly summaries
├── drafts/           # Publication-ready content
├── .system/          # SQLite DB, config, logs
│   ├── bookmarks.db
│   └── logs/
├── src/              # TypeScript source code
│   ├── services/     # Core business logic
│   ├── bot/          # Telegram bot
│   ├── db/           # Database operations
│   ├── git/          # Git automation
│   ├── config/       # Configuration
│   └── types/        # TypeScript types
└── tests/            # Jest tests
```

## Bookmark Status System

Every bookmark goes through a lifecycle:

### Triage Phase (Onboarding Only)
- `triage_pending` → Waiting for evaluation
- `triage_evaluating` → AI checking relevance
- `triage_approved` → Cleared for processing
- `triage_archived_*` → Outdated/superseded
- `triage_rejected_*` → Fake/incorrect

### Processing Phase
- `queue_pending` → Waiting in queue
- `queue_extracting` → Fetching content
- `queue_processing` → AI summarizing
- `processed` → Successfully processed

### Final States
- `active` → In knowledge base (sources/)
- `archived` → In archive/ with reason
- `rejected` → In rejected/ with fact-check

## Development

### Run Tests

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
```

### Linting & Formatting

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm typecheck
```

### Build for Production

```bash
pnpm build
pnpm start
```

## Configuration

See `.env.example` for all configuration options.

Key settings:
- `OLLAMA_MODEL`: LLM model for processing (default: qwen2.5:14b)
- `RAINDROP_POLL_INTERVAL`: Polling frequency in seconds (default: 900)
- `PROCESSING_BATCH_SIZE`: Concurrent processing limit (default: 5)
- `GIT_AUTO_COMMIT`: Auto-commit changes (default: true)

## Telegram Bot Commands

```
/search <query>       - Semantic search
/topics               - List topic clusters
/summary <topic>      - Topic overview
/weekly               - Latest synthesis
/generate post <topic> - Create LinkedIn draft
/stats                - System metrics
/status               - Queue status
/triage <id>          - Review triage decision
/rejected             - Show rejected bookmarks
```

## Architecture

```
Raindrop.io API
    ↓
SQLite Queue (status tracking)
    ↓
Ollama Processing (triage → extract → summarize → classify)
    ↓
Foam Markdown (sources/, archive/, rejected/, topics/)
    ↓
Git (auto-commit)
    ↓
Telegram Bot (query interface)
```

## Development Workflow

1. All tasks tracked in `TASKS.md`
2. Follow functional programming patterns (see `.cursorrules`)
3. Write tests for all new features
4. Use Zod for external data validation
5. Keep functions small and focused
6. No classes, prefer pure functions

## Contributing

This is a personal project, but contributions are welcome!

1. Check `TASKS.md` for open tasks
2. Follow `.cursorrules` for code style
3. Write tests for new features
4. Submit PR with clear description

## Documentation

### Getting Started
- **[Quick Start Guide](docs/QUICK_START.md)**: Step-by-step setup for X Bookmarks workflow

### Core Documentation
- **[CLAUDE.md](CLAUDE.md)**: System overview and development guide
- **[TASKS.md](TASKS.md)**: Development task tracker and roadmap
- **[FOAM_GUIDE.md](FOAM_GUIDE.md)**: How the Foam knowledge base works
- **[.cursorrules](.cursorrules)**: Code style and patterns

### Technical Specifications
- **[System Spec](docs/SPEC.md)**: Complete technical specification
- **[X Bookmarks CDP Spec](docs/X_BOOKMARKS_CDP_SPEC.md)**: X (Twitter) bookmarks extraction via Chrome DevTools Protocol
- **[Research Service Spec](docs/SPEC_RESEARCH_SERVICE.md)**: Fact-checking and research architecture

### Architecture & Implementation
- **[Triage Architecture](docs/ARCHITECTURE_TRIAGE.md)**: Phase 1.4 - LLM-based content triage
- **[Phase 1.4 Summary](docs/PHASE_1_4_SUMMARY.md)**: Initial triage findings and approach
- **[Phase 1.4 Complete](docs/PHASE_1_4_COMPLETE.md)**: Triage implementation results and next steps


## Troubleshooting

### Ollama Not Running
```bash
# Start Ollama
ollama serve

# Check models
ollama list
```

### Database Issues
```bash
# Delete and reinitialize
rm .system/bookmarks.db
pnpm onboard
```

### Git Issues
```bash
# Check status
git status

# Reset if needed
git reset --hard HEAD
```

## Performance

- Bookmark processing: ~30s per bookmark
- Search latency: <2s
- Weekly synthesis: <5min
- Telegram response: <3s

## Privacy & Security

- All processing happens locally (no cloud LLMs)
- Raindrop token stored in .env (never committed)
- Telegram bot restricted to specific chat IDs
- Git repository can be private
- No telemetry or external logging

## License

MIT - Personal use

## Author

Luis

---

**Built with TypeScript, Ollama, and ❤️**

