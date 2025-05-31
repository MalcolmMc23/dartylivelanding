import { Pool } from 'pg';

// Ensure the DATABASE_URL environment variable is set.
// This is crucial for the application to connect to PostgreSQL.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set. Please ensure it is configured in your .env.local file or environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optional: Add more pool configurations if needed. Examples:
  // max: 20, // maximum number of clients in the pool
  // idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
  // connectionTimeoutMillis: 2000, // how long to wait for a connection from the pool if all connections are busy
});

// Event listener for new client connections.
// Useful for logging or setting session-specific parameters.
pool.on('connect', () => {
  console.log('PostgreSQL client connected successfully to the database.');
  // Example: Set a session-specific parameter (uncomment if needed)
  // client.query('SET TIME ZONE \'UTC\'');
});

// Event listener for errors on idle clients.
// Helps in diagnosing and handling unexpected PostgreSQL client errors.
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client.', err);
  // It's usually not recommended to exit the entire process on a pool error,
  // as the pool itself has mechanisms to handle failed clients and may attempt to reconnect.
  // Consider adding more robust error logging or an alerting mechanism here.
});

export default pool;

// Note on Graceful Shutdown for Next.js Applications:
// Managing a graceful shutdown (e.g., calling pool.end()) in Next.js can be complex due to its lifecycle,
// especially in serverless deployments or during development with hot-reloading.
// Typically, Next.js or the underlying Node.js runtime handles process termination, which should close active connections.
// If explicit cleanup is essential for your setup (e.g., specific resource release), 
// consider implementing it in a dedicated shutdown hook or script appropriate for your deployment environment.
// For most standard Next.js projects, relying on the default process exit behavior is sufficient. 