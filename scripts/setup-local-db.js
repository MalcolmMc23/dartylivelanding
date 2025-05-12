const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function setupDatabase() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to the database');

        // Create tables

        // 1. waiting_users table
        await client.query(`
      CREATE TABLE IF NOT EXISTS waiting_users (
        username TEXT PRIMARY KEY,
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        use_demo BOOLEAN DEFAULT FALSE,
        in_call BOOLEAN DEFAULT FALSE,
        room_name TEXT,
        last_matched_with TEXT,
        last_matched_at TIMESTAMP WITH TIME ZONE
      )
    `);
        console.log('Created waiting_users table');

        // 2. matched_pairs table
        await client.query(`
      CREATE TABLE IF NOT EXISTS matched_pairs (
        id SERIAL PRIMARY KEY,
        user1 TEXT NOT NULL,
        user2 TEXT NOT NULL,
        room_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        use_demo BOOLEAN DEFAULT FALSE
      )
    `);
        console.log('Created matched_pairs table');

        // 3. emails table
        await client.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
        console.log('Created emails table');

        console.log('All tables created successfully!');
        console.log('Your local database is now ready for development.');

    } catch (error) {
        console.error('Error setting up database:', error);
    } finally {
        await client.end();
    }
}

setupDatabase(); 