/**
 * Chrome DevTools Protocol (CDP) Client
 *
 * Shared CDP connection logic for browser-based ingestion adapters.
 * Uses raw WebSocket connection (not Puppeteer) to preserve user session.
 *
 * Following functional patterns - pure functions, no classes.
 */

import { WebSocket } from 'ws';

// ============================================================================
// Types
// ============================================================================

/**
 * CDP connection configuration
 */
export interface CDPConfig {
    readonly endpoint: string;
    readonly pageLoadWaitMs: number;
}

/**
 * Default CDP configuration
 */
export const DEFAULT_CDP_CONFIG: CDPConfig = {
    endpoint: 'http://localhost:9222',
    pageLoadWaitMs: 5000,
};

/**
 * CDP command sender function
 */
export type CDPCommandSender = <T = unknown>(
    method: string,
    params?: Record<string, unknown>
) => Promise<T>;

/**
 * Active CDP session
 */
export interface CDPSession {
    readonly ws: WebSocket;
    readonly sendCommand: CDPCommandSender;
    readonly close: () => void;
}

/**
 * Browser tab information from CDP
 */
export interface CDPTab {
    readonly id: string;
    readonly title: string;
    readonly url: string;
    readonly type: string;
    readonly webSocketDebuggerUrl: string;
}

/**
 * CDP runtime evaluate result
 */
export interface CDPEvalResult<T> {
    readonly result: {
        readonly type: string;
        readonly value: T;
    };
}

// ============================================================================
// Connection Functions
// ============================================================================

/**
 * Check if Chrome is running with CDP enabled.
 * Returns browser version info if connected.
 */
export const checkCDPConnection = async (
    config: CDPConfig = DEFAULT_CDP_CONFIG
): Promise<{ browser: string; protocolVersion: string; wsUrl: string }> => {
    const response = await fetch(`${config.endpoint}/json/version`);

    if (!response.ok) {
        throw new Error(
            `Chrome not running with CDP. Please start Chrome with:\n` +
            `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\\n` +
            `  --remote-debugging-port=9222 \\\n` +
            `  --user-data-dir="$HOME/chrome-profile-cdp"`
        );
    }

    const data = (await response.json()) as {
        Browser: string;
        'Protocol-Version': string;
        webSocketDebuggerUrl: string;
    };

    return {
        browser: data.Browser,
        protocolVersion: data['Protocol-Version'],
        wsUrl: data.webSocketDebuggerUrl,
    };
};

/**
 * List all open tabs in Chrome.
 */
export const listTabs = async (config: CDPConfig = DEFAULT_CDP_CONFIG): Promise<readonly CDPTab[]> => {
    const response = await fetch(`${config.endpoint}/json/list`);

    if (!response.ok) {
        throw new Error(`Failed to list tabs: HTTP ${response.status}`);
    }

    const tabs = (await response.json()) as Array<{
        id: string;
        title: string;
        url: string;
        type: string;
        webSocketDebuggerUrl: string;
    }>;

    return tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        type: tab.type,
        webSocketDebuggerUrl: tab.webSocketDebuggerUrl,
    }));
};

/**
 * Find a tab matching a URL pattern.
 */
export const findTab = async (
    urlPattern: RegExp | string,
    config: CDPConfig = DEFAULT_CDP_CONFIG
): Promise<CDPTab | undefined> => {
    const tabs = await listTabs(config);
    const pattern = typeof urlPattern === 'string' ? new RegExp(urlPattern) : urlPattern;

    return tabs.find((tab) => pattern.test(tab.url));
};

/**
 * Find or get first available page tab.
 */
export const findOrGetFirstTab = async (
    urlPattern?: RegExp | string,
    config: CDPConfig = DEFAULT_CDP_CONFIG
): Promise<CDPTab> => {
    const tabs = await listTabs(config);

    // Try to find matching tab first
    if (urlPattern) {
        const pattern = typeof urlPattern === 'string' ? new RegExp(urlPattern) : urlPattern;
        const matching = tabs.find((tab) => pattern.test(tab.url));
        if (matching) return matching;
    }

    // Fall back to first page tab
    const pageTab = tabs.find((tab) => tab.type === 'page');
    if (!pageTab) {
        throw new Error('No suitable tab found. Please open a tab in Chrome.');
    }

    return pageTab;
};

// ============================================================================
// Session Management
// ============================================================================

/**
 * Connect to a tab via WebSocket and return a command sender.
 */
export const connectToTab = (tab: CDPTab): Promise<CDPSession> => {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(tab.webSocketDebuggerUrl);
        let messageId = 0;
        const pendingMessages = new Map<
            number,
            { resolve: (value: unknown) => void; reject: (error: Error) => void }
        >();

        ws.on('open', async () => {
            const sendCommand: CDPCommandSender = <T>(
                method: string,
                params: Record<string, unknown> = {}
            ): Promise<T> => {
                return new Promise((res, rej) => {
                    const id = ++messageId;
                    pendingMessages.set(id, {
                        resolve: res as (value: unknown) => void,
                        reject: rej,
                    });
                    ws.send(JSON.stringify({ id, method, params }));
                });
            };

            // Enable required CDP domains
            await sendCommand('Page.enable');
            await sendCommand('Runtime.enable');
            await sendCommand('DOM.enable');

            const close = (): void => {
                ws.close();
            };

            resolve({ ws, sendCommand, close });
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString()) as {
                id?: number;
                result?: unknown;
                error?: { message: string };
                method?: string;
            };

            if (message.id !== undefined && pendingMessages.has(message.id)) {
                const pending = pendingMessages.get(message.id)!;
                pendingMessages.delete(message.id);

                if (message.error) {
                    pending.reject(new Error(message.error.message));
                } else {
                    pending.resolve(message.result);
                }
            }
        });

        ws.on('error', reject);
        ws.on('close', () => {
            // Reject any pending messages on close
            Array.from(pendingMessages.values()).forEach((pending) => {
                pending.reject(new Error('WebSocket closed'));
            });
            pendingMessages.clear();
        });
    });
};

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Navigate to a URL and wait for page load.
 */
export const navigateTo = async (
    session: CDPSession,
    url: string,
    waitMs: number = DEFAULT_CDP_CONFIG.pageLoadWaitMs
): Promise<void> => {
    await session.sendCommand('Page.navigate', { url });
    await sleep(waitMs);
};

/**
 * Get current page URL.
 */
export const getCurrentUrl = async (session: CDPSession): Promise<string> => {
    const result = await session.sendCommand<CDPEvalResult<string>>('Runtime.evaluate', {
        expression: 'window.location.href',
    });
    return result.result.value;
};

/**
 * Execute JavaScript in page context and return result.
 */
export const evaluate = async <T>(session: CDPSession, expression: string): Promise<T> => {
    const result = await session.sendCommand<any>('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });

    if (result.exceptionDetails) {
        throw new Error(`JS Evaluation failed: ${result.exceptionDetails.exception.description}`);
    }

    return result.result.value;
};

/**
 * Scroll the page by specified amount.
 */
export const scrollBy = async (
    session: CDPSession,
    amount: number,
    smooth: boolean = true
): Promise<void> => {
    await session.sendCommand('Runtime.evaluate', {
        expression: `window.scrollBy({ top: ${amount}, behavior: '${smooth ? 'smooth' : 'auto'}' })`,
    });
};

/**
 * Get current scroll position.
 */
export const getScrollPosition = async (session: CDPSession): Promise<number> => {
    return evaluate<number>(session, 'window.scrollY');
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * Sleep for specified milliseconds.
 */
export const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate random jitter (0 to max ms).
 */
export const randomJitter = (maxMs: number): number => Math.floor(Math.random() * maxMs);

/**
 * Sleep with jitter added.
 */
export const sleepWithJitter = (baseMs: number, jitterMs: number): Promise<void> =>
    sleep(baseMs + randomJitter(jitterMs));
