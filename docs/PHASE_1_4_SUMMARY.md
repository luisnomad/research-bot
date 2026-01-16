# Phase 1.4: Triage - Current State & Findings

**Date**: 2026-01-16  
**Status**: ✅ Architecture documented, initial testing complete

## Summary

Phase 1.4 is **ready for implementation**. The core infrastructure exists, testing reveals the LLM works correctly, but the triage prompt needs refinement to avoid over-rejection.

## What We Have

### Database
- ✅ **61 seeds** from X Bookmarks, all in `pending` status
- ✅ Schema v2 with complete triage support
- ✅ Location: `.system/bookmarks.db`

### LLM Infrastructure
- ✅ **Triage Model**: `llama3.2-vision:latest` (8/10 quality)
- ✅ **Ollama Service**: Model discovery and recommendation working
- ✅ **Triage Service**: Prompt generation and JSON parsing functional
- ✅ **Test Harness**: `src/cli/test-triage.ts` validates single seeds

### Code Structure
```
src/
├── llm/
│   ├── ollama.ts          ✅ Model management
│   ├── triage.ts          ✅ Triage service
│   └── types.ts           ✅ Type definitions
├── db/
│   ├── schema.ts          ✅ Database with triage fields
│   └── seed-operations.ts ✅ CRUD operations
└── cli/
    ├── test-triage.ts     ✅ Single seed test
    └── discover-models.ts ✅ Model benchmarking
```

## Test Results

### Test Run (2026-01-16)

**Command**: `pnpm tsx src/cli/test-triage.ts`

**Input Seed**:
- Author: @victormustar
- Content: "Funny how you can do the same thing with a local model without sending all your data to a remote cloud." + "using this here:"
- Source: x-bookmarks (2011078287762825474)

**LLM Response** (16.14s):
```json
{
  "status": "rejected",
  "confidence": 0.95,
  "reason": "The content appears to be a personal opinion rather than factual information.",
  "topics": ["local models vs cloud storage"],
  "isMisleading": true,
  "factCheckDetail": "No verifiable claims are made about the superiority of local over remote data processing."
}
```

### Analysis

**Issue**: The LLM is being **overly conservative** and rejecting valid content.

**Why this happened**:
1. Tweet is short and lacks context (only 2 parts, second is incomplete: "using this here:")
2. Prompt emphasizes fact-checking heavily
3. LLM interprets opinion/commentary as "misleading"

**This is actually GOOD**:
- The system is working correctly
- We can tune the prompt to be more permissive
- Better to start strict and loosen than vice versa

## Prompt Refinement Needed

### Current Prompt Issues

From `src/llm/triage.ts` (lines 77-81):

```typescript
CRITERIA:
1. NOVELTY: Does this add value? (Always assume yes for now unless obviously junk)
2. ACCURACY: Are claims verifiable? Is it a known scam, fake news, or hallucination?
3. RELEVANCE: Is this outdated? (e.g., tech versions from 3 years ago that are superseded)
4. QUALITY: Is it actionable or just noise/spam?
```

**Problem**: "Always assume yes for now" is not being followed.

### Recommended Changes

1. **Emphasize permissiveness** - User already filtered by bookmarking
2. **Clarify "opinion vs misinformation"** - Opinions are valid, fake news is not
3. **Add context about social media** - Tweets are often commentary, not research papers
4. **Adjust rejection threshold** - Only reject obvious spam/scams/fake news

### Proposed Prompt Update

```typescript
CRITERIA:
1. NOVELTY: User bookmarked this, so assume it has value. Only reject if obviously spam/duplicate.
2. ACCURACY: Is this a known scam, fake news, or deliberate misinformation? 
   - Personal opinions and commentary are VALID, even if subjective.
   - Only flag if claims are provably false or misleading.
3. RELEVANCE: Is this severely outdated? (e.g., "React 16 tutorial" in 2026)
4. QUALITY: Is it spam, bot content, or completely off-topic?

IMPORTANT: 
- Social media posts are often opinions/commentary - this is VALID content.
- Only use "rejected" for spam, scams, or deliberate misinformation.
- When in doubt, use "approved" or "archived", not "rejected".
```

## Architecture Documentation

Created comprehensive architecture docs:

1. **`ARCHITECTURE_TRIAGE.md`** - Full Phase 1.4 architecture
   - Data flow diagrams
   - Database schema details
   - Markdown output templates
   - File naming conventions
   - Integration with Phase 1.5 and 1.9

2. **This file** - Current state and findings

## Next Steps

### Immediate (Before Batch Processing)

1. **Refine triage prompt** in `src/llm/triage.ts`
   - Make it more permissive
   - Clarify opinion vs misinformation
   - Test on 5-10 diverse seeds

2. **Validate prompt changes**
   - Run `test-triage.ts` multiple times
   - Check for false positives/negatives
   - Adjust confidence thresholds

### Phase 1.4 Implementation

3. **Create batch processor** (`src/cli/triage-batch.ts`)
   - Process N seeds at a time
   - Update database with results
   - Progress tracking and logging
   - Error handling and retry logic

4. **Add database operations** (`src/db/triage-operations.ts`)
   - `updateTriageStatus(seedId, result)`
   - `getPendingSeeds(limit)`
   - `getTriageStats()`

5. **Test on subset**
   - Process 10 seeds
   - Review decisions manually
   - Adjust prompt if needed

6. **Process all 61 seeds**
   - Full batch run
   - Generate statistics
   - Review edge cases

### Phase 1.5 (Next)

7. **Markdown generation**
   - Create directory structure (`sources/`, `archive/`, `rejected/`)
   - Template generator with frontmatter
   - Wikilink generation
   - File writing

## Technical Notes

### Node.js Version Issue (Resolved)

- **Error**: `better-sqlite3` was compiled for Node v21, but v23 is running
- **Fix**: `pnpm rebuild better-sqlite3`
- **Status**: ✅ Resolved

### TypeScript Errors (Non-blocking)

- Some errors in `src/config/index.ts` and `src/cli/discover-models.ts`
- Not in triage code path
- Can be fixed later

## Performance Metrics

- **Triage Speed**: ~16 seconds per seed (llama3.2-vision:latest)
- **Estimated Batch Time**: 61 seeds × 16s = ~16 minutes
- **Acceptable**: For night processing, this is fine

## Decision Points

### Should we proceed with batch processing?

**Recommendation**: **Not yet**. First:

1. Refine the prompt (30 minutes)
2. Test on 5-10 seeds (10 minutes)
3. Review results manually (15 minutes)
4. Then proceed with batch

### Alternative: Use a different model?

**Current**: `llama3.2-vision:latest` (8/10 quality)  
**Alternative**: `locationbot-admin:latest` (9/10 speed, but unknown quality for triage)

**Recommendation**: Stick with `llama3.2-vision:latest` for now. Speed is acceptable for night processing.

## Questions for Luis

1. **Prompt tuning**: Should we make the triage more permissive (approve by default) or keep it strict?

2. **Batch size**: Process all 61 seeds at once, or start with 10 for validation?

3. **Manual review**: Do you want to review triage decisions before markdown generation, or trust the LLM?

4. **Rejection threshold**: What confidence level should trigger manual review? (e.g., confidence < 0.7)

## Files Created

- ✅ `ARCHITECTURE_TRIAGE.md` - Comprehensive architecture documentation
- ✅ `PHASE_1_4_SUMMARY.md` - This file

## Ready to Proceed?

**Status**: 🟡 **Blocked on prompt refinement**

Once we adjust the prompt and validate on a few seeds, we're ready to:
1. Implement batch processor
2. Process all 61 seeds
3. Move to Phase 1.5 (markdown generation)

---

**Next Action**: Refine triage prompt in `src/llm/triage.ts`
