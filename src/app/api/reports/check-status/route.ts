import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json({ 
        error: 'Missing username' 
      }, { status: 400 });
    }

    // Get user status
    const result = await pool.query(
      `SELECT status 
       FROM "user" 
       WHERE username = $1`,
      [username]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }

    const status = result.rows[0].status;
    const isTimeout = status === 'timeout';

    return NextResponse.json({ 
      status,
      isTimeout
    });
  } catch (error) {
    console.error('Error checking user status:', error);
    return NextResponse.json({ 
      error: 'Failed to check user status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 