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
  console.log("SECRET", process.env.NEXTAUTH_SECRET);
  console.log(`get-username returned session: ${session}`)
  if (!session || !session.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pool.query(
      'SELECT username FROM "user" WHERE email = $1',
      [session.user.email]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ username: result.rows[0].username });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Database error" }, { status: 500 });
  }
}
