import { initDatabase, closeDatabase } from '../db/schema.js';
import { semanticSearch, getSeedById } from '../db/seed-operations.js';

async function test() {
    const db = initDatabase();
    try {
        const seed = getSeedById(db, 1);
        if (!seed || !seed.embedding) {
            console.log('Seed 1 not found or has no embedding');
            return;
        }

        console.log('Searching for neighbors of seed 1...');
        const similar = semanticSearch(db, seed.embedding, 10);
        console.log(`Found ${similar.length} similar items total (including self potentially).`);

        const filtered = similar.filter(s => s.id !== seed.id && s.markdownPath);
        console.log(`Found ${filtered.length} filtered items (not self, has path).`);

        filtered.forEach(s => {
            console.log(`- ID: ${s.id}, Path: ${s.markdownPath}, Score: ${s.similarity}`);
        });

    } finally {
        closeDatabase(db);
    }
}

test().catch(console.error);
