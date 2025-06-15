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
    // Create reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER NOT NULL,
        reported_user_id INTEGER NOT NULL,
        reason VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending',
        resolved_at TIMESTAMP WITH TIME ZONE,
        resolved_by VARCHAR(255),
        FOREIGN KEY (reporter_id) REFERENCES "user"(id) ON DELETE CASCADE,
        FOREIGN KEY (reported_user_id) REFERENCES "user"(id) ON DELETE CASCADE
      );

      -- Create indexes for better query performance
      CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
      CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_user_id);
      CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
      CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
    `);

    return NextResponse.json({ 
      message: 'Reports table created successfully',
      table: 'reports'
    });
  } catch (error) {
    console.error('Error creating reports table:', error);
    return NextResponse.json({ 
      error: 'Failed to create reports table',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 