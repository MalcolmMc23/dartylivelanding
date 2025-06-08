import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Railway or Supabase
  },
});

export async function GET() {
  try {
    // Create verification_attempts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_attempts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_email FOREIGN KEY (email) REFERENCES "user"(email) ON DELETE CASCADE
      );

      -- Create index for faster rate limit checks
      CREATE INDEX IF NOT EXISTS idx_verification_attempts_email_created_at 
      ON verification_attempts(email, created_at);
    `);

    return NextResponse.json({ 
      message: 'Verification attempts table created successfully',
      table: 'verification_attempts'
    });
  } catch (error) {
    console.error('Error creating verification attempts table:', error);
    return NextResponse.json({ 
      error: 'Failed to create verification attempts table',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 