import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function GET() {
  const session = await getServerSession(authOptions);
  console.log('get-username session details:', {
    hasSession: !!session,
    email: session?.user?.email,
    user: session?.user
  });

  if (!session || !session.user?.email) {
    console.log('No session or email found');
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    // First, let's check if we can connect to the database
    console.log('Database connection string:', process.env.POSTGRES_URL ? 'Present' : 'Missing');
    
    // Let's check what users exist in the database
    const allUsers = await pool.query('SELECT email, username FROM "user"');
    console.log('All users in database:', allUsers.rows);

    // Now try to find the specific user
    console.log('Querying database for email:', session.user.email);
    const result = await pool.query(
      'SELECT username FROM "user" WHERE email = $1',
      [session.user.email]
    );
    console.log('Database query result:', {
      rowCount: result.rows.length,
      rows: result.rows,
      query: 'SELECT username FROM "user" WHERE email = $1',
      params: [session.user.email]
    });

    if (result.rows.length === 0) {
      console.log('No user found in database for email:', session.user.email);
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ username: result.rows[0].username });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ message: "Database error" }, { status: 500 });
  }
}
