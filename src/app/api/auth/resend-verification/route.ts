import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { VerificationEmail } from '@/emails/VerificationEmail';
import { render } from '@react-email/render';
import { Pool } from 'pg';
import crypto from 'crypto';

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Railway or Supabase
  },
});

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check rate limiting using database
    const rateLimitResult = await pool.query(
      'SELECT COUNT(*) FROM verification_attempts WHERE email = $1 AND created_at > NOW() - INTERVAL \'24 hours\'',
      [email]
    );
    
    const attempts = parseInt(rateLimitResult.rows[0].count);
    if (attempts >= 3) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Get user from database
    const userResult = await pool.query(
      'SELECT id, username, verified FROM "user" WHERE email = $1',
      [email]
    );

    const user = userResult.rows[0];
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (user.verified) {
      return NextResponse.json(
        { error: 'Email is already verified' },
        { status: 400 }
      );
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    // Update user with new verification token
    await pool.query(
      'UPDATE "user" SET verification_token = $1, token_expiry = $2 WHERE email = $3',
      [verificationToken, tokenExpiry, email]
    );

    // Record verification attempt
    await pool.query(
      'INSERT INTO verification_attempts (email, created_at) VALUES ($1, NOW())',
      [email]
    );

    // Send verification email
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`;
    const emailHtml = await render(VerificationEmail({ 
      username: user.username, 
      verificationUrl 
    }));

    await resend.emails.send({
      from: 'DormParty <fredrickf@dormparty.live>',
      to: email,
      subject: 'Verify your DormParty account',
      html: emailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resending verification email:', error);
    return NextResponse.json(
      { error: 'Failed to resend verification email' },
      { status: 500 }
    );
  }
} 