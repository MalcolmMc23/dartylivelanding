import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { deleteRoom } from '@/lib/livekitService';

export async function POST(request: Request) {
  try {
    const { userId, sessionId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    console.log(`[Skip] User ${userId} skipping session ${sessionId || 'unknown'}`);

    // Get match data to find the other user
    const matchData = await redis.get(`match:${userId}`);
    let roomName: string | null = null;
    let otherUserId: string | null = null;

    if (matchData) {
      const match = JSON.parse(matchData);
      roomName = match.roomName;
      otherUserId = match.user1 === userId ? match.user2 : match.user1;
    }

    // === CLEANUP CURRENT USER (SKIPPER) ===
    // 1. Remove from all Redis sets
    await redis.zrem('matching:waiting', userId);
    await redis.zrem('matching:in_call', userId);
    
    // 2. Remove match data
    await redis.del(`match:${userId}`);
    
    // 3. Remove heartbeat
    await redis.del(`heartbeat:${userId}`);
    
    // 4. Clear any force-disconnect flags
    await redis.del(`force-disconnect:${userId}`);

    console.log(`[Skip] Cleaned up state for user ${userId}`);

    // === HANDLE OTHER USER (SKIPPED USER) ===
    if (otherUserId) {
      console.log(`[Skip] Handling skipped user: ${otherUserId}`);
      
      // 1. Remove from all Redis sets
      await redis.zrem('matching:waiting', otherUserId);
      await redis.zrem('matching:in_call', otherUserId);
      
      // 2. Remove match data
      await redis.del(`match:${otherUserId}`);
      
      // 3. Mark other user as force disconnected
      await redis.setex(`force-disconnect:${otherUserId}`, 30, 'true');
      
      // 4. Re-queue the skipped user back to waiting
      // First check if they still have a recent heartbeat (are still online)
      const otherUserHeartbeat = await redis.get(`heartbeat:${otherUserId}`);
      const now = Date.now();
      
      if (otherUserHeartbeat && (now - parseInt(otherUserHeartbeat)) < 30000) {
        // User is still active, add them back to the queue
        await redis.zadd('matching:waiting', Date.now(), otherUserId);
        console.log(`[Skip] Re-queued skipped user ${otherUserId} back to waiting`);
      } else {
        // User is stale/offline, clean up their heartbeat
        await redis.del(`heartbeat:${otherUserId}`);
        console.log(`[Skip] Skipped user ${otherUserId} is offline, not re-queuing`);
      }
    }

    // === DELETE LIVEKIT ROOM ===
    if (roomName) {
      console.log(`[Skip] Deleting LiveKit room: ${roomName}`);
      try {
        await deleteRoom(roomName);
      } catch (error) {
        console.error('Error deleting LiveKit room:', error);
      }
    }
    
    // === VERIFY CLEANUP ===
    const verifyWaiting = await redis.zscore('matching:waiting', userId);
    const verifyInCall = await redis.zscore('matching:in_call', userId);
    const verifyMatch = await redis.get(`match:${userId}`);
    
    console.log(`[Skip] Verification for ${userId}:`, {
      inWaiting: verifyWaiting !== null,
      inCall: verifyInCall !== null,
      hasMatch: verifyMatch !== null
    });
    
    return NextResponse.json({
      success: true,
      message: 'Session skipped and users reset',
      cleanup: {
        userId,
        otherUserId,
        otherUserRequeued: otherUserId !== null,
        roomDeleted: roomName !== null
      }
    });
  } catch (error) {
    console.error('Error skipping session:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}