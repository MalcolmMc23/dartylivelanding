import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import pool from '@/lib/db';
import redis from '@/lib/redis';

export async function GET() {
  try {
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

    // Get all users in queue with their scores (timestamps)
    const queueData = await redis.zrange('matching:waiting', 0, -1, 'WITHSCORES');
    
    // Parse the queue data (alternating members and scores)
    const queue: { userId: string; timestamp: number }[] = [];
    for (let i = 0; i < queueData.length; i += 2) {
      queue.push({
        userId: queueData[i],
        timestamp: parseInt(queueData[i + 1])
      });
    }

    // Find user's position in queue
    const position = queue.findIndex(item => item.userId === userId) + 1;
    
    if (position === 0) {
      // User not in queue
      return NextResponse.json({
        position: 0,
        estimatedWaitTime: 0,
        inQueue: false
      });
    }

    // Estimate wait time based on position
    // Assume average match time of 30 seconds per pair
    const estimatedWaitTime = (position - 1) * 30 * 1000;

    return NextResponse.json({
      position,
      estimatedWaitTime,
      inQueue: true,
      queueLength: queue.length
    });
  } catch (error) {
    console.error('Error in status:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 