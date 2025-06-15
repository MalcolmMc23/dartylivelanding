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
    console.log('Received report submission:', body);

    const { reporterUsername, reportedUsername, reason, description } = body;

    if (!reporterUsername || !reportedUsername || !reason) {
      console.error('Missing required fields:', { reporterUsername, reportedUsername, reason });
      return NextResponse.json({ 
        error: 'Missing required fields' 
      }, { status: 400 });
    }

    // First get the user IDs from usernames
    const reporterResult = await pool.query(
      'SELECT id FROM "user" WHERE username = $1',
      [reporterUsername]
    );
    const reportedResult = await pool.query(
      'SELECT id FROM "user" WHERE username = $1',
      [reportedUsername]
    );

    console.log('User lookup results:', {
      reporter: reporterResult.rows[0],
      reported: reportedResult.rows[0]
    });

    if (!reporterResult.rows[0] || !reportedResult.rows[0]) {
      console.error('User not found:', { reporterUsername, reportedUsername });
      return NextResponse.json({ 
        error: 'One or both users not found' 
      }, { status: 404 });
    }

    const reporterId = reporterResult.rows[0].id;
    const reportedUserId = reportedResult.rows[0].id;

    // Check report counts
    const reportedCountResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM reports 
       WHERE reported_user_id = $1`,
      [reportedUserId]
    );

    const reporterCountResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM reports 
       WHERE reporter_id = $1
       AND created_at >= NOW() - INTERVAL '24 hours'`,
      [reporterId]
    );

    const reportedCount = parseInt(reportedCountResult.rows[0].count);
    const reporterCount = parseInt(reporterCountResult.rows[0].count);

    // Update user statuses based on thresholds
    // The limit is 5, just add one for the current report
    if (reportedCount >= 4) {
      await pool.query(
        `UPDATE "user" 
         SET status = 'notified' 
         WHERE id = $1`,
        [reportedUserId]
      );
    }

    if (reporterCount >= 4) {
      await pool.query(
        `UPDATE "user" 
         SET status = 'timeout' 
         WHERE id = $1`,
        [reporterId]
      );
    }

    // Insert the report
    const result = await pool.query(
      `INSERT INTO reports 
       (reporter_id, reported_user_id, reason, description) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id`,
      [reporterId, reportedUserId, reason, description]
    );

    console.log('Report submitted successfully:', result.rows[0]);

    const totalReported: number = reportedCount + 1;
    
    return NextResponse.json({ 
      message: 'Report submitted successfully',
      reportId: result.rows[0].id,
      totalReported: totalReported
    });
  } catch (error) {
    console.error('Error submitting report:', error);
    return NextResponse.json({ 
      error: 'Failed to submit report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 