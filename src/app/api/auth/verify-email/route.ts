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
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { message: 'Verification token is required' },
        { status: 400 }
      );
    }

    // Find user with this token and check if it's not expired
    const result = await pool.query(
      'SELECT email FROM "user" WHERE verification_token = $1 AND token_expiry > NOW() AND verified = false',
      [token]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { message: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    const { email } = result.rows[0];

    // Update user as verified and clear the token
    await pool.query(
      'UPDATE "user" SET verified = true, verification_token = NULL, token_expiry = NULL WHERE email = $1',
      [email]
    );

    return NextResponse.json({
      message: 'Email verified successfully',
      email
    });
  } catch (error) {
    console.error('Error verifying email:', error);
    return NextResponse.json(
      { message: 'Failed to verify email' },
      { status: 500 }
    );
  }
} 