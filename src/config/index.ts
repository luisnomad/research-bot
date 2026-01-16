/**
 * Configuration loader with Zod validation
 */

import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';
import type { Config } from '../types/index.js';

// Load environment variables
dotenvConfig();

/**
 * Zod schema for configuration validation
 */
const ConfigSchema = z.object({
  ollama: z.object({
    host: z.string().url().default('http://localhost:11434'),
    model: z.string().default('qwen2.5:14b'),
    embedding_model: z.string().default('nomic-embed-text'),
    timeout: z.number().int().positive().default(120000),
  }),
  telegram: z.object({
    bot_token: z.string().optional(),
    allowed_chat_ids: z.array(z.string()).default([]),
    enabled: z.boolean().default(false),
  }),
  system: z.object({
    knowledge_base_path: z.string().default('./'),
    database_path: z.string().default('./.system/bookmarks.db'),
    log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
  processing: z.object({
    max_retries: z.number().int().positive().default(3),
    batch_size: z.number().int().positive().default(5),
    nightly_schedule: z.string().default('0 0 * * *'),
  }),
  git: z.object({
    auto_commit: z.boolean().default(true),
    commit_batch_size: z.number().int().positive().default(10),
  }),
});

/**
 * Load and validate configuration from environment variables
 */
export const loadConfig = (): Config => {
  const rawConfig = {
    ollama: {
      host: process.env['OLLAMA_HOST'] || 'http://localhost:11434',
      model: process.env['OLLAMA_MODEL'] || 'qwen2.5:14b',
      embedding_model: process.env['OLLAMA_EMBEDDING_MODEL'] || 'nomic-embed-text',
      timeout: parseInt(process.env['OLLAMA_TIMEOUT'] || '120000', 10),
    },
    telegram: {
      bot_token: process.env['TELEGRAM_BOT_TOKEN'],
      allowed_chat_ids: process.env['TELEGRAM_ALLOWED_CHAT_IDS']?.split(',') || [],
      enabled: process.env['ENABLE_TELEGRAM_BOT'] === 'true',
    },
    system: {
      knowledge_base_path: process.env['KNOWLEDGE_BASE_PATH'] || './',
      database_path: process.env['DATABASE_PATH'] || './.system/bookmarks.db',
      log_level: (process.env['LOG_LEVEL'] || 'info') as 'debug' | 'info' | 'warn' | 'error',
    },
    processing: {
      max_retries: parseInt(process.env['MAX_RETRIES'] || '3', 10),
      batch_size: parseInt(process.env['PROCESSING_BATCH_SIZE'] || '5', 10),
      nightly_schedule: process.env['NIGHTLY_SCHEDULE'] || '0 0 * * *',
    },
    git: {
      auto_commit: process.env['GIT_AUTO_COMMIT'] !== 'false',
      commit_batch_size: parseInt(process.env['GIT_COMMIT_BATCH_SIZE'] || '10', 10),
    },
  };

  // Validate configuration
  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return result.data as unknown as Config;
};

/**
 * Global config instance
 */
let configInstance: Config | undefined;

/**
 * Get configuration singleton
 */
export const getConfig = (): Config => {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
};
