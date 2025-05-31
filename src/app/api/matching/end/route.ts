import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import pool from '@/lib/db';
import redis from '@/lib/redis';
import { deleteRoom } from '@/lib/livekitService';

export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json();
    
    // Get authenticated user
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get username from database
    const userResult = await pool.query(
      'SELECT username FROM "user" WHERE email = $1',
      [session.user.email]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const username = userResult.rows[0].username;
    const userId = username;

    // Update session as ended
    await pool.query(
      'UPDATE sessions SET ended_at = NOW(), ended_by = $1 WHERE id = $2',
      ['user_end', sessionId]
    );

    // Get the room name to delete
    const sessionResult = await pool.query(
      'SELECT room_name FROM sessions WHERE id = $1',
      [sessionId]
    );
    
    if (sessionResult.rows.length > 0) {
      // Delete the LiveKit room
      await deleteRoom(sessionResult.rows[0].room_name);
    }

    // Remove user from in_call set
    await redis.zrem('matching:in_call', userId);

    return NextResponse.json({
      success: true,
      message: 'Session ended successfully'
    });
  } catch (error) {
    console.error('Error in end:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 