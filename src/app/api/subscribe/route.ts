import { Pool } from 'pg';
import { NextResponse } from 'next/server';

// Create a new pool instance using the environment variable
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false // Required for Railway connections
  }
});

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ message: 'Email is required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return NextResponse.json({ message: 'Invalid email format' }, { status: 400 });
    }

    // Validate that it's a .edu email
    if (!email.endsWith('.edu')) {
        return NextResponse.json({ message: 'Only .edu email addresses are allowed' }, { status: 400 });
    }

    // Insert email into the database
    const result = await pool.query(
      'INSERT INTO emails (email) VALUES ($1) RETURNING id',
      [email]
    );

    console.log('Email inserted with ID:', result.rows[0].id);

    return NextResponse.json({ message: 'Email submitted successfully!', id: result.rows[0].id }, { status: 201 });

  } catch (error) {
    console.error('Database Error:', error);
    // Check for unique constraint violation (email already exists)
    // Adjust the error code based on your specific Postgres setup if needed
    if (error instanceof Error && 'code' in error && error.code === '23505') {
        return NextResponse.json({ message: 'Email already subscribed.' }, { status: 409 }); // 409 Conflict
    }
    return NextResponse.json({ message: 'Failed to submit email' }, { status: 500 });
  }
}