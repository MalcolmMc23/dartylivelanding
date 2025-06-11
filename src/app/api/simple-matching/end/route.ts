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

    // === CLEANUP USERS (Optimized with parallel operations) ===
    const cleanupOps = [
      // Cleanup current user
      redis.del(`matching:waiting_${userId}`),
      redis.zrem('matching:in_call', userId),
      redis.del(`match:${userId}`),
      redis.del(`heartbeat:${userId}`),
      redis.del(`force-disconnect:${userId}`)
    ];
    
    // Add other user cleanup if needed
    if (shouldCleanupOtherUser && otherUserId) {
      console.log(`[End] Also cleaning up other user: ${otherUserId}`);
      cleanupOps.push(
        redis.del(`matching:waiting_${otherUserId}`),
        redis.zrem('matching:in_call', otherUserId),
        redis.del(`match:${otherUserId}`),
        redis.del(`heartbeat:${otherUserId}`)
      );
    }
    
    // Execute all cleanup operations in parallel
    await Promise.all(cleanupOps);
    
    // Set force-disconnect separately if needed
    if (shouldCleanupOtherUser && otherUserId) {
      await redis.setex(`force-disconnect:${otherUserId}`, 30, 'true');
    }
    
    console.log(`[End] Cleanup completed for user(s)`);

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
    const verifyWaiting = await redis.get(`matching:waiting_${userId}`);
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