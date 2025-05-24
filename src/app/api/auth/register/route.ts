import { NextResponse } from 'next/server';
import { hash } from 'bcrypt';
import { Pool } from 'pg';

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Railway or Supabase
  },
});

export async function POST(request: Request) {
    try {
      const { email, password, username } = await request.json(); // <-- Add username

      if (!email || !password || !username) { // <-- Check username
        return NextResponse.json({ message: 'Email, password, and username required' }, { status: 400 });
      }

      // Server-side .edu check
      if (typeof email !== "string" || !email.trim().toLowerCase().endsWith(".edu")) {
        return NextResponse.json({ message: 'You must use a .edu email address to register.' }, { status: 400 });
      }

      const hashedPassword = await hash(password, 10);

      await pool.query(
        'INSERT INTO "user" (email, password, username) VALUES ($1, $2, $3)', // <-- Add username column
        [email, hashedPassword, username] // <-- Add username value
      );

      // Send welcome email using a relative path
      await fetch('http://localhost:3000/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName: username })
      });

      return NextResponse.json({ message: 'User created successfully' }, { status: 201 });

    } catch (e: unknown) {
      console.error('Registration error:', e); // <-- important
      // Type guard to check if e is an object with a 'code' property
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === '23505') {
        return NextResponse.json({ message: 'An account with this email already exists.' }, { status: 409 });
      }
      return NextResponse.json({ message: 'Registration failed' }, { status: 500 });
    }
  }

