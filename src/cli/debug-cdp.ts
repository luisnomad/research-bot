/**
 * Debug CDP evaluate
 */
import { findOrGetFirstTab, connectToTab, evaluate, checkCDPConnection } from '../ingestors/common/cdp-client.js';
import { DEFAULT_CDP_CONFIG } from '../ingestors/common/cdp-client.js';

async function main() {
    const cdpConfig = DEFAULT_CDP_CONFIG;
    await checkCDPConnection(cdpConfig);
    const tab = await findOrGetFirstTab(undefined, cdpConfig);
    const session = await connectToTab(tab);

    try {
        console.log('Testing evaluate document.title...');
        const title = await evaluate<string>(session, 'document.title');
        console.log('Title:', title);

        console.log('Testing evaluate array...');
        const array = await evaluate<number[]>(session, '[1, 2, 3]');
        console.log('Array:', array);

        console.log('Testing evaluate object...');
        const obj = await evaluate<any>(session, '({ a: 1, b: "test" })');
        console.log('Object:', obj);
    } finally {
        session.close();
    }
}

main().catch(console.error);
