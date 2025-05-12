const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function cleanupStaleUsers() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to the database');

        // Delete users who have been waiting for more than 2 minutes
        const result = await client.query(`
      DELETE FROM waiting_users 
      WHERE joined_at < NOW() - INTERVAL '2 minutes'
      RETURNING username
    `);

        if (result.rowCount > 0) {
            console.log(`Cleaned up ${result.rowCount} stale users from the waiting queue`);
            result.rows.forEach(row => {
                console.log(`- Removed: ${row.username}`);
            });
        } else {
            console.log('No stale users found in the waiting queue');
        }

    } catch (error) {
        console.error('Error cleaning up stale users:', error);
    } finally {
        await client.end();
    }
}

cleanupStaleUsers(); 