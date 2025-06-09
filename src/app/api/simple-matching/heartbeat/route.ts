import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    // Update user's heartbeat timestamp
    const timestamp = Date.now();
    await redis.setex(`heartbeat:${userId}`, 10, timestamp.toString()); // 10 second TTL

    // Check if user is in queue and update their score (timestamp)
    const inQueue = await redis.zscore('matching:waiting', userId);
    if (inQueue !== null) {
      // Keep their original position but update heartbeat
      await redis.zadd('matching:waiting', parseInt(inQueue), userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in heartbeat:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}