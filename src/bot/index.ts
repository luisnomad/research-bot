import { BotService } from './bot-service.js';
import { logger } from '../config/logger.js';

/**
 * Standalone Bot Entry Point
 */
async function run() {
    logger.info('Starting Telegram Bot in standalone mode...');
    await BotService.start();
}

run().catch(err => {
    logger.error(`Fatal bot error: ${err.message}`);
    process.exit(1);
});
