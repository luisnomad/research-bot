/**
 * Core type definitions for the Knowledge Base system
 */

// ============================================================================
// Content Extraction Types
// ============================================================================

/**
 * Extracted article content
 */
export interface ExtractedContent {
  title: string;
  content: string;
  textContent: string;
  excerpt?: string;
  author?: string;
  published?: Date;
  source?: string;
  length: number;
}

/**
 * Extraction result with error handling
 */
export type ExtractionResult =
  | { success: true; data: ExtractedContent }
  | { success: false; error: string };

// ============================================================================
// Ollama Types
// ============================================================================

/**
 * Triage evaluation response from LLM
 */
export interface TriageEvaluation {
  still_relevant: boolean;
  reason: string;
  confidence: number;
  better_alternative?: string;
}

/**
 * Fact-check response from LLM
 */
export interface FactCheck {
  accurate: boolean;
  reason: string;
  source_says: string;
  verdict: 'accurate' | 'exaggerated' | 'misrepresented' | 'debunked';
}

/**
 * Content summary from LLM
 */
export interface ContentSummary {
  summary: string;
  key_insights: string[];
  notable_quotes?: string[];
  technical_details?: string[];
  topics: string[];
}

/**
 * Entity extraction response
 */
export interface ExtractedEntities {
  people: string[];
  technologies: string[];
  companies: string[];
  concepts: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * System configuration
 */
export interface Config {
  ollama: {
    host: string;
    model: string;
    embedding_model: string;
    timeout: number;
  };
  telegram: {
    bot_token?: string;
    allowed_chat_ids: string[];
    enabled: boolean;
  };
  system: {
    knowledge_base_path: string;
    database_path: string;
    log_level: string;
  };
  processing: {
    max_retries: number;
    batch_size: number;
    nightly_schedule: string;
  };
  git: {
    auto_commit: boolean;
    commit_batch_size: number;
  };
}

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * System statistics
 */
export interface SystemStats {
  total_bookmarks: number;
  active: number;
  archived: number;
  rejected: number;
  processing: number;
  failed: number;
  topics: number;
  last_synthesis?: Date;
}

/**
 * Processing progress
 */
export interface ProcessingProgress {
  total: number;
  processed: number;
  triaged: number;
  approved: number;
  archived: number;
  rejected: number;
  failed: number;
  current_status?: string;
}
