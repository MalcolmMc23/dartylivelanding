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
    const { reporterUsername, reportedUsername } = body;

    if (!reporterUsername || !reportedUsername) {
      return NextResponse.json({ 
        error: 'Missing required fields' 
      }, { status: 400 });
    }

    // Get user IDs
    const reporterResult = await pool.query(
      'SELECT id FROM "user" WHERE username = $1',
      [reporterUsername]
    );
    const reportedResult = await pool.query(
      'SELECT id FROM "user" WHERE username = $1',
      [reportedUsername]
    );

    if (!reporterResult.rows[0] || !reportedResult.rows[0]) {
      return NextResponse.json({ 
        error: 'One or both users not found' 
      }, { status: 404 });
    }

    const reporterId = reporterResult.rows[0].id;
    const reportedUserId = reportedResult.rows[0].id;

    // Check how many times the reported user has been reported
    const reportedCountResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM reports 
       WHERE reported_user_id = $1`,
      [reportedUserId]
    );

    // Check how many times the reporter has submitted reports
    const reporterCountResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM reports 
       WHERE reporter_id = $1`,
      [reporterId]
    );

    const reportedCount = parseInt(reportedCountResult.rows[0].count);
    const reporterCount = parseInt(reporterCountResult.rows[0].count);

    return NextResponse.json({
      reportedCount,
      reporterCount,
      reportedThresholdReached: reportedCount >= 5,
      reporterThresholdReached: reporterCount >= 5
    });
  } catch (error) {
    console.error('Error checking report counts:', error);
    return NextResponse.json({ 
      error: 'Failed to check report counts',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 