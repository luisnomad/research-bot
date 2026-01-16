# Quick Start Guide - X Bookmarks

**Current Implementation**: Phase 1 - X Bookmarks → Triage → Storage

## Prerequisites

1. **Node.js 20+**: Install from [nodejs.org](https://nodejs.org/)
2. **pnpm**: Install with `npm install -g pnpm`
3. **Ollama**: Install from [ollama.ai](https://ollama.ai/)
4. **Google Chrome**: For X Bookmarks extraction via CDP

## Setup

### 1. Install Dependencies

```bash
pnpm install
pnpm rebuild better-sqlite3  # Rebuild native module for your Node version
```

### 2. Install Ollama Models

```bash
# For triage (recommended)
ollama pull llama3.2-vision:latest

# For embeddings (Phase 2)
ollama pull nomic-embed-text
```

### 3. Set Up Chrome with CDP

Launch Chrome with remote debugging enabled:

**macOS**:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

**Linux**:
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

**Windows**:
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --remote-debugging-port=9222 \
  --user-data-dir=C:\temp\chrome-debug
```

**Important**: Log into X (Twitter) in this Chrome instance before proceeding.

## Workflow

### Step 1: Import X Bookmarks

Import from a specific X Bookmarks folder:

```bash
pnpm import:x https://x.com/i/bookmarks/1899171982010130843
```

**What this does**:
- Scrolls through the bookmark folder
- Collects all URLs
- Extracts full content (two-phase: feed → individual tweets)
- Detects threads automatically
- Saves to database as "pending" seeds

**Example output**:
```
📊 Import Summary:
   Total found: 64 bookmarks
   Already imported: 3
   Newly imported: 61
   Threads detected: 12
```

### Step 2: Triage Seeds

Process seeds with LLM triage:

```bash
# Test single seed first
pnpm triage:test

# Process 10 seeds
pnpm triage:batch 10

# Process all pending seeds
pnpm triage:batch 100
```

**What this does**:
- Validates content quality (permissive by default)
- Flags spam/scams/misinformation
- Assigns confidence scores (0.0-1.0)
- Marks low-confidence items (<0.5) for review
- Updates database with triage results

**Example output**:
```
📊 Results:
   ✅ Approved:     10 (100%)
   📦 Archived:     0
   ❌ Rejected:     0
   ⚠️  Needs Review: 0
   
⏱️  Duration: 59.60s (avg 5.96s per seed)
```

### Step 3: Generate Markdown (Phase 1.5 - Coming Soon)

```bash
pnpm generate:markdown
```

This will create FOAM-compatible markdown files in:
- `sources/` - Approved content
- `archive/` - Outdated but valuable
- `rejected/` - Spam/scams (rare)

## Available Commands

```bash
# Import
pnpm import:x <folder-url>    # Import X bookmarks from folder

# Triage
pnpm triage:test              # Test triage on single seed
pnpm triage:batch [limit]     # Process N seeds (default: 10)

# Development
pnpm dev                      # Start development server
pnpm build                    # Build for production
pnpm typecheck                # Run TypeScript checks
pnpm lint                     # Run linter
```

## Troubleshooting

### Chrome CDP Connection Failed

**Error**: `Failed to connect to Chrome DevTools Protocol`

**Solution**:
1. Ensure Chrome is running with `--remote-debugging-port=9222`
2. Check that port 9222 is not blocked
3. Verify you're logged into X in that Chrome instance

### better-sqlite3 Module Error

**Error**: `NODE_MODULE_VERSION mismatch`

**Solution**:
```bash
pnpm rebuild better-sqlite3
```

### Ollama Not Running

**Error**: `Failed to connect to Ollama`

**Solution**:
```bash
# Start Ollama
ollama serve

# Check models
ollama list

# Pull required model
ollama pull llama3.2-vision:latest
```

### No Pending Seeds

**Error**: `ℹ️  No pending seeds found in database.`

**Solution**: Import bookmarks first with `pnpm import:x <folder-url>`

## Next Steps

1. ✅ **Import bookmarks** - Done with `pnpm import:x`
2. ✅ **Triage seeds** - Done with `pnpm triage:batch`
3. ⏳ **Generate markdown** - Phase 1.5 (coming soon)
4. ⏳ **Add Raindrop source** - Phase 2
5. ⏳ **Embeddings & search** - Phase 2
6. ⏳ **Topic clustering** - Phase 3

## Documentation

See [README.md](../README.md) for complete documentation and architecture details.
