import cron from 'node-cron';
import { OrchestratorService } from './orchestrator.js';
import { logger } from '../config/logger.js';
import { NotificationService } from './telegram-notification.js';
import { getConfig } from '../config/index.js';

/**
 * Scheduler Service
 * 
 * Manages periodic jobs (Nightly processing, etc.)
 */
export const SchedulerService = {
    /**
     * Start the scheduler
     */
    start(): void {
        const config = getConfig();
        const schedule = config.processing.nightly_schedule;

        logger.info(`Initializing scheduler with schedule: ${schedule}`);

        // Nightly Job
        cron.schedule(schedule, async () => {
            logger.info('Scheduled Nightly Job started...');
            try {
                await OrchestratorService.runNightlyProcessing();
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error(`Critical error in nightly scheduled job: ${errorMsg}`);
            }
        });

        logger.info(`Scheduler started. Nightly job scheduled for: ${schedule}`);

        // Send a startup notification
        NotificationService.notify(`🚀 *Knowledge Base Scheduler Started*\nNightly processing scheduled for: \`${schedule}\``).catch(err => {
            logger.error('Failed to send startup notification:', err);
        });
    }
};
