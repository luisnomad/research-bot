import { Bot, Context } from 'grammy';
import { getConfig } from '../config/index.js';
import { logger } from '../config/logger.js';
import { getSeedStats } from '../db/seed-operations.js';
import { initDatabase, closeDatabase } from '../db/schema.js';
import { UrlIngestorService } from '../services/url-ingestor.js';

/**
 * Custom context type for our bot
 */
export type BotContext = Context;

/**
 * Initialize and configure the Telegram bot
 */
export const createBot = () => {
    const config = getConfig();

    if (!config.telegram.enabled || !config.telegram.bot_token) {
        logger.warn('Telegram bot is disabled or bot token is missing.');
        return null;
    }

    const bot = new Bot<BotContext>(config.telegram.bot_token);

    // Middleware to check if user is allowed
    bot.use(async (ctx, next) => {
        const chatId = ctx.chat?.id.toString();
        const allowedIds = config.telegram.allowed_chat_ids;

        if (chatId && allowedIds.includes(chatId)) {
            await next();
        } else {
            logger.warn(`Unauthorized access attempt from chat ID: ${chatId}`);
            if (ctx.from?.username) {
                logger.warn(`User: @${ctx.from.username}`);
            }
        }
    });

    // Commands
    bot.command('start', async (ctx) => {
        await ctx.reply(
            '🧠 *Knowledge Base Bot*\n\n' +
            'I am your knowledge base assistant. Send me URLs to queue them for processing, or use the commands below.\n\n' +
            '*Commands:*\n' +
            '/status - System health and statistics\n' +
            '/today - Summary of today\'s processing\n',
            { parse_mode: 'Markdown' }
        );
    });

    bot.command('status', async (ctx) => {
        const db = initDatabase();
        try {
            const stats = getSeedStats(db);

            const message =
                '📊 *System Status*\n\n' +
                `*Total Seeds:* ${stats.total}\n` +
                `*Pending:* ${stats.pending}\n` +
                `*Approved:* ${stats.approved}\n` +
                `*Archived:* ${stats.archived}\n` +
                `*Rejected:* ${stats.rejected}\n\n` +
                `*Processed:* ${stats.processed}\n\n` +
                '*By Source:*\n' +
                Object.entries(stats.bySource)
                    .map(([source, count]) => `- ${source}: ${count}`)
                    .join('\n');

            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Error fetching stats for /status command: ${errorMsg}`);
            await ctx.reply('❌ Failed to fetch system status.');
        } finally {
            closeDatabase(db);
        }
    });

    bot.command('today', async (ctx) => {
        const db = initDatabase();
        try {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

            // Count processed today
            const stmt = db.prepare('SELECT COUNT(*) as count FROM seeds WHERE processed_at >= ?');
            const processedToday = (stmt.get(startOfDay) as { count: number }).count;

            // Count triaged today
            const stmt2 = db.prepare('SELECT COUNT(*) as count FROM seeds WHERE triage_at >= ?');
            const triagedToday = (stmt2.get(startOfDay) as { count: number }).count;

            const message =
                '📅 *Today\'s Summary*\n\n' +
                `*Triaged:* ${triagedToday}\n` +
                `*Markdown Generated:* ${processedToday}\n\n` +
                (triagedToday === 0 ? '_No activity recorded yet today._' : '_Keep up the great work!_');

            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Error fetching today's summary: ${errorMsg}`);
            await ctx.reply('❌ Failed to fetch today\'s summary.');
        } finally {
            closeDatabase(db);
        }
    });

    // URL Handler
    bot.on('message:text', async (ctx) => {
        const text = ctx.message.text;
        const urlMatch = text.match(/https?:\/\/[^\s]+/);

        if (urlMatch) {
            const url = urlMatch[0];
            const feedbackMsg = await ctx.reply(`🔗 *URL detected:* \`${url}\`\nQueuing for ingestion...`, { parse_mode: 'Markdown' });

            try {
                const result = await UrlIngestorService.ingest(url);

                if (result.success) {
                    if (result.alreadyExists) {
                        await ctx.api.editMessageText(
                            feedbackMsg.chat.id,
                            feedbackMsg.message_id,
                            `✅ *Ingested:* \`${url}\`\n(Already existed in queue)`
                        );
                    } else {
                        await ctx.api.editMessageText(
                            feedbackMsg.chat.id,
                            feedbackMsg.message_id,
                            `✅ *Ingested:* \`${url}\`\nAdded to queue for nightly processing (ID: ${result.seedId}).`
                        );
                    }
                } else {
                    await ctx.api.editMessageText(
                        feedbackMsg.chat.id,
                        feedbackMsg.message_id,
                        `❌ *Failed to ingest:* \`${url}\`\nError: ${result.error}`
                    );
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                await ctx.api.editMessageText(
                    feedbackMsg.chat.id,
                    feedbackMsg.message_id,
                    `❌ *Error:* \`${url}\`\nSomething went wrong: ${errorMsg}`
                );
            }
        } else {
            // Help message for unknown text
            await ctx.reply('I only understand commands or URLs. Try /status or send a URL.');
        }
    });

    // Error handling
    bot.catch((err) => {
        logger.error(`Bot error: ${err.message}`);
    });

    return bot;
};
