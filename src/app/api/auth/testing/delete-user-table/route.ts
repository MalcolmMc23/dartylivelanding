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
    // Drop the user table if it exists
    await pool.query('DROP TABLE IF EXISTS "user"');
    
    return NextResponse.json({ 
      message: 'User table deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting user table:', error);
    return NextResponse.json(
      { message: 'Failed to delete user table' },
      { status: 500 }
    );
  }
} 