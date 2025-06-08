import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function GET() {
  return handleRequest();
}

export async function POST() {
  return handleRequest();
}

async function handleRequest() {
  try {
    // Create the user table with all necessary fields
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user" (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        verified BOOLEAN DEFAULT false,
        verification_token TEXT,
        token_expiry TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    return NextResponse.json({ 
      message: 'User table created successfully' 
    });
  } catch (error) {
    console.error('Error creating user table:', error);
    return NextResponse.json(
      { message: 'Failed to create user table' },
      { status: 500 }
    );
  }
} 