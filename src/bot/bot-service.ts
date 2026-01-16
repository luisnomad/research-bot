import { Bot } from 'grammy';
import { createBot } from './bot.js';
import { logger } from '../config/logger.js';
import { getConfig } from '../config/index.js';

let botInstance: Bot | null = null;

/**
 * Service to manage Telegram bot lifecycle
 */
export const BotService = {
    /**
     * Start the bot
     */
    async start(): Promise<void> {
        const config = getConfig();
        if (!config.telegram.enabled || !config.telegram.bot_token) {
            return;
        }

        if (botInstance) {
            logger.warn('Bot is already running.');
            return;
        }

        botInstance = createBot();

        if (botInstance) {
            // Start bot in the background
            botInstance.start().catch(err => {
                logger.error('Failed to start Telegram bot:', err);
            });
            logger.info('Telegram bot started and listening for messages.');
        }
    },

    /**
     * Stop the bot
     */
    async stop(): Promise<void> {
        if (botInstance) {
            await botInstance.stop();
            botInstance = null;
            logger.info('Telegram bot stopped.');
        }
    },

    /**
     * Get the bot instance
     */
    getBot(): Bot | null {
        return botInstance;
    },

    /**
     * Send a notification message
     */
    async notify(message: string): Promise<void> {
        const config = getConfig();
        const chatIds = config.telegram.allowed_chat_ids;

        if (chatIds.length === 0) {
            logger.warn('No allowed chat IDs configured for Telegram notifications.');
            return;
        }

        // Use bot instance if running, otherwise create a temporary one (or use NotificationService's way)
        const bot = botInstance || (config.telegram.bot_token ? new Bot(config.telegram.bot_token) : null);

        if (!bot) {
            logger.warn('Bot instance not available for notification.');
            return;
        }

        for (const chatId of chatIds) {
            try {
                await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error(`Failed to send Telegram notification to ${chatId}: ${errorMsg}`);
            }
        }
    }
};
