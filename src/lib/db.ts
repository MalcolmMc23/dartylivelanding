import { Pool } from 'pg';

// Flag to track if we've shown the database warning
let hasShownDbWarning = false;

// Determine if this is a local development environment
const isLocalDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// Use environment variables for connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDevelopment ? false : {
    rejectUnauthorized: false // Only for production/staging environments
  }
});

// Test the connection and show a warning if it fails
async function testConnection() {
  try {
    console.log('Attempting to connect to database...');
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Successfully connected to PostgreSQL database');
    return true;
  } catch (error: unknown) {
    if (!hasShownDbWarning) {
      console.warn('⚠️ Warning: Could not connect to PostgreSQL database. Make sure DATABASE_URL is properly set.');
      console.warn('The application will fall back to in-memory state, which is less reliable.');
      console.warn(`Error details: ${error instanceof Error ? error.message : String(error)}`);
      // Log more specific error information
      console.error('Full error:', error);
      hasShownDbWarning = true;
    }
    return false;
  }
}

// Try to establish connection on startup
testConnection();

export async function query(text: string, params: unknown[] = []) {
  try {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error: unknown) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Create a named export object
const dbUtils = { query, pool, testConnection };
export default dbUtils;