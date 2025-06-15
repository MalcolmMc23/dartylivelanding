import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        r.id,
        r.reason,
        r.description,
        r.status,
        r.created_at,
        r.resolved_at,
        r.resolved_by,
        reporter.username as reporter_username,
        reported.username as reported_username
      FROM reports r
      JOIN "user" reporter ON r.reporter_id = reporter.id
      JOIN "user" reported ON r.reported_user_id = reported.id
      ORDER BY r.created_at DESC
    `);

    console.log('Fetched reports:', result.rows.length);

    return NextResponse.json({ 
      reports: result.rows
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch reports',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 