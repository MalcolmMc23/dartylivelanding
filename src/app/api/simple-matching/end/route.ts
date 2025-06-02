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

    console.log(`[End] User ${userId} ending session ${sessionId || 'unknown'}`);

    // Get match data to find the other user
    const matchData = await redis.get(`match:${userId}`);
    let roomName: string | null = null;
    let otherUserId: string | null = null;
    let shouldCleanupOtherUser = false;

    if (matchData) {
      const match = JSON.parse(matchData);
      roomName = match.roomName;
      otherUserId = match.user1 === userId ? match.user2 : match.user1;
      
      // Only cleanup other user if this is a real session end (not cancel/cleanup)
      shouldCleanupOtherUser = sessionId && sessionId !== 'cancel' && sessionId !== 'cleanup';
    }

    // === CLEANUP CURRENT USER ===
    // 1. Remove from all Redis sets
    await redis.zrem('matching:waiting', userId);
    await redis.zrem('matching:in_call', userId);
    
    // 2. Remove match data
    await redis.del(`match:${userId}`);
    
    // 3. Remove heartbeat
    await redis.del(`heartbeat:${userId}`);
    
    // 4. Clear any force-disconnect flags
    await redis.del(`force-disconnect:${userId}`);

    console.log(`[End] Cleaned up state for user ${userId}`);

    // === CLEANUP OTHER USER (if in active call) ===
    if (shouldCleanupOtherUser && otherUserId) {
      console.log(`[End] Also cleaning up other user: ${otherUserId}`);
      
      // 1. Remove from all Redis sets
      await redis.zrem('matching:waiting', otherUserId);
      await redis.zrem('matching:in_call', otherUserId);
      
      // 2. Remove match data
      await redis.del(`match:${otherUserId}`);
      
      // 3. Remove heartbeat
      await redis.del(`heartbeat:${otherUserId}`);
      
      // 4. Mark other user as force disconnected
      await redis.setex(`force-disconnect:${otherUserId}`, 30, 'true');
      
      console.log(`[End] Cleaned up state for other user ${otherUserId}`);
    }

    // === DELETE LIVEKIT ROOM ===
    if (roomName && shouldCleanupOtherUser) {
      console.log(`[End] Deleting LiveKit room: ${roomName}`);
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
    
    console.log(`[End] Verification for ${userId}:`, {
      inWaiting: verifyWaiting !== null,
      inCall: verifyInCall !== null,
      hasMatch: verifyMatch !== null
    });
    
    return NextResponse.json({
      success: true,
      message: 'Session ended and state fully cleaned up',
      cleanup: {
        userId,
        otherUserId: shouldCleanupOtherUser ? otherUserId : null,
        roomDeleted: shouldCleanupOtherUser && roomName
      }
    });
  } catch (error) {
    console.error('Error ending session:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}