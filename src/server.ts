import { getConfig } from './config/index.js';
import { logger } from './config/logger.js';
import { SchedulerService } from './services/scheduler.js';
import { BotService } from './bot/bot-service.js';

/**
 * Main application entry point
 */
async function bootstrap() {
    const config = getConfig();

    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('  🧠 Knowledge Base Automator Starting');
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info(`  Mode: ${process.env['NODE_ENV'] || 'development'}`);
    logger.info(`  Log Level: ${config.system.log_level}`);
    logger.info(`  Database: ${config.system.database_path}`);
    logger.info('═══════════════════════════════════════════════════════════════\n');

    try {
        // Start the scheduler
        SchedulerService.start();

        // Start Telegram Bot
        if (config.telegram.enabled) {
            await BotService.start();
        }

        logger.info('System is up and running. Press Ctrl+C to stop.\n');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to start the application: ${errorMsg}`);
        process.exit(1);
    }
}

// Handle termination
process.on('SIGINT', () => {
    logger.info('\nShutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('\nShutting down gracefully...');
    process.exit(0);
});

// Run
bootstrap().catch(error => {
    console.error('Fatal error during bootstrap:', error);
    process.exit(1);
});
