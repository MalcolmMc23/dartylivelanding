import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Log the connection string (without sensitive parts) for debugging
const connectionString = process.env.POSTGRES_URL;
console.log('Connection string exists:', !!connectionString);
if (connectionString) {
  const sanitizedUrl = connectionString.replace(/:[^:@]*@/, ':****@');
  console.log('Sanitized connection string:', sanitizedUrl);
}

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function GET() {
  try {
    // Test the database connection
    const result = await pool.query('SELECT NOW()');
    return NextResponse.json({ 
      status: 'success', 
      message: 'Database connection successful',
      timestamp: result.rows[0].now 
    });
  } catch (error) {
    console.error('Database connection error:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      envCheck: {
        hasPostgresUrl: !!process.env.POSTGRES_URL,
        hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL
      }
    }, { status: 500 });
  }
} 