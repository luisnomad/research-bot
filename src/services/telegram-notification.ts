import { getConfig } from '../config/index.js';
import { logger } from '../config/logger.js';
import { BotService } from '../bot/bot-service.js';

/**
 * Service to send simple notifications via Telegram
 */
export const NotificationService = {
    /**
     * Send a message to all allowed chat IDs
     */
    async notify(message: string): Promise<void> {
        const config = getConfig();
        if (!config.telegram.enabled) {
            logger.info('Telegram notifications are disabled.');
            return;
        }

        await BotService.notify(message);
    }
};
