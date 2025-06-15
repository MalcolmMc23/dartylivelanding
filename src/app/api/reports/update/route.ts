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
    console.log('Received report update:', body);

    const { reportId, status, resolvedBy } = body;

    if (!reportId || !status) {
      console.error('Missing required fields:', { reportId, status });
      return NextResponse.json({ 
        error: 'Missing required fields' 
      }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE reports 
       SET status = $1::VARCHAR(20),
           resolved_at = CASE WHEN $1::VARCHAR(20) != 'pending' THEN CURRENT_TIMESTAMP ELSE NULL END,
           resolved_by = $2
       WHERE id = $3
       RETURNING *`,
      [status, resolvedBy, reportId]
    );

    if (result.rowCount === 0) {
      console.error('Report not found:', reportId);
      return NextResponse.json({ 
        error: 'Report not found' 
      }, { status: 404 });
    }

    console.log('Report updated successfully:', result.rows[0]);

    return NextResponse.json({ 
      message: 'Report updated successfully',
      report: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating report:', error);
    return NextResponse.json({ 
      error: 'Failed to update report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 