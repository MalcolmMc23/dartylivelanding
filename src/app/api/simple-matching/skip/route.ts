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

    // === CLEANUP BOTH USERS ===
    console.log(`[Skip] Cleaning up both users: ${userId} and ${otherUserId}`);
    
    // Clean up current user (skipper)
    await redis.zrem('matching:waiting', userId);
    await redis.zrem('matching:in_call', userId);
    await redis.del(`match:${userId}`);
    await redis.del(`force-disconnect:${userId}`);
    console.log(`[Skip] Cleaned up state for user ${userId}`);

    // Clean up other user if exists
    if (otherUserId) {
      await redis.zrem('matching:waiting', otherUserId);
      await redis.zrem('matching:in_call', otherUserId);
      await redis.del(`match:${otherUserId}`);
      
      // Mark other user as force disconnected so they get kicked from the room
      await redis.setex(`force-disconnect:${otherUserId}`, 30, 'true');
      console.log(`[Skip] Cleaned up state for other user ${otherUserId}`);
    }

    // === RE-QUEUE BOTH USERS ===
    const now = Date.now();
    
    // Re-queue the skipper (current user) - they should have a recent heartbeat
    const skipperHeartbeat = await redis.get(`heartbeat:${userId}`);
    if (skipperHeartbeat && (now - parseInt(skipperHeartbeat)) < 30000) {
      await redis.zadd('matching:waiting', Date.now(), userId);
      console.log(`[Skip] Re-queued skipper ${userId} back to waiting`);
    } else {
      console.log(`[Skip] Skipper ${userId} heartbeat is stale, not re-queuing`);
    }
    
    // Re-queue the other user if they're still online
    if (otherUserId) {
      const otherUserHeartbeat = await redis.get(`heartbeat:${otherUserId}`);
      if (otherUserHeartbeat && (now - parseInt(otherUserHeartbeat)) < 30000) {
        await redis.zadd('matching:waiting', Date.now(), otherUserId);
        console.log(`[Skip] Re-queued other user ${otherUserId} back to waiting`);
      } else {
        // User is stale/offline, clean up their heartbeat
        await redis.del(`heartbeat:${otherUserId}`);
        console.log(`[Skip] Other user ${otherUserId} is offline, not re-queuing`);
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
      message: 'Session skipped, both users disconnected and re-queued',
      cleanup: {
        userId,
        otherUserId,
        bothUsersRequeued: true,
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