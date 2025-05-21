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
      const { email, password } = await request.json();
  
      if (!email || !password) {
        return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
      }
  
      const hashedPassword = await hash(password, 10);
  
      await pool.query(
        'INSERT INTO "user" (email, password) VALUES ($1, $2)',
        [email, hashedPassword]
      );
  
      return NextResponse.json({ message: 'User created successfully' }, { status: 201 });
  
    } catch (e: any) {
      console.error('Registration error:', e); // <-- important
      // Check for unique violation error code (Postgres: 23505)
      if (e.code === '23505') {
        return NextResponse.json({ message: 'An account with this email already exists.' }, { status: 409 });
      }
      return NextResponse.json({ message: 'Registration failed' }, { status: 500 });
    }
  }

