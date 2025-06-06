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

    // Check multiple disconnect flags for redundancy
    const [
      forceDisconnect,
      skipInProgress,
      preSkip,
      matchData
    ] = await Promise.all([
      redis.get(`force-disconnect:${userId}`),
      redis.get(`skip-in-progress:${userId}`),
      redis.get(`pre-skip:${userId}`),
      redis.get(`match:${userId}`)
    ]);
    
    // Also check if room was deleted
    let roomDeleted = false;
    if (matchData) {
      const match = JSON.parse(matchData);
      roomDeleted = await redis.get(`room-deleted:${match.roomName}`) !== null;
    }
    
    const shouldDisconnect = !!(forceDisconnect || skipInProgress || preSkip || roomDeleted);
    
    if (shouldDisconnect) {
      // Clear all flags atomically
      const keysToDelete = [
        `force-disconnect:${userId}`,
        `skip-in-progress:${userId}`,
        `pre-skip:${userId}`
      ];
      
      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
      }
      
      console.log(`[CheckDisconnect] User ${userId} should disconnect. Flags:`, {
        forceDisconnect: !!forceDisconnect,
        skipInProgress: !!skipInProgress,
        preSkip: !!preSkip,
        roomDeleted
      });
      
      return NextResponse.json({
        success: true,
        shouldDisconnect: true,
        reason: forceDisconnect ? 'force-disconnect' : 
                skipInProgress ? 'skip-in-progress' : 
                preSkip ? 'pre-skip' :
                roomDeleted ? 'room-deleted' : 'unknown'
      });
    }
    
    return NextResponse.json({
      success: true,
      shouldDisconnect: false
    });
  } catch (error) {
    console.error('Error checking disconnect:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}