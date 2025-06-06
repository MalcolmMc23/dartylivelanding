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

    console.log(`[Force Cleanup] Cleaning all state for user ${userId}`);

    // Remove from all possible Redis keys
    const cleanupOperations = [
      // Remove from sets
      redis.zrem('matching:waiting', userId),
      redis.zrem('matching:in_call', userId),
      
      // Delete keys
      redis.del(`match:${userId}`),
      redis.del(`heartbeat:${userId}`),
      redis.del(`force-disconnect:${userId}`),
    ];

    await Promise.all(cleanupOperations);

    // Verify cleanup
    const verifications = await Promise.all([
      redis.zscore('matching:waiting', userId),
      redis.zscore('matching:in_call', userId),
      redis.get(`match:${userId}`),
      redis.get(`heartbeat:${userId}`),
      redis.get(`force-disconnect:${userId}`)
    ]);

    const allClean = verifications.every(v => v === null);

    console.log(`[Force Cleanup] Complete for ${userId}. All clean: ${allClean}`);

    return NextResponse.json({
      success: true,
      message: 'Force cleanup completed',
      allClean,
      verifications: {
        inWaiting: verifications[0] !== null,
        inCall: verifications[1] !== null,
        hasMatch: verifications[2] !== null,
        hasHeartbeat: verifications[3] !== null,
        hasForceDisconnect: verifications[4] !== null
      }
    });
  } catch (error) {
    console.error('Error in force cleanup:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}