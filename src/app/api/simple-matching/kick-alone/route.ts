import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { deleteRoom } from '@/lib/livekitService';

export async function POST(request: Request) {
  try {
    const { userId, reason } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    console.log(`[KickAlone] Kicking alone user ${userId} - reason: ${reason}`);

    // Get match data to clean up
    const matchData = await redis.get(`match:${userId}`);
    let roomName: string | null = null;

    if (matchData) {
      const match = JSON.parse(matchData);
      roomName = match.roomName;
    }

    // Clean up the user's state
    const cleanupOps = [
      redis.zrem('matching:waiting', userId),
      redis.zrem('matching:in_call', userId),
      redis.del(`match:${userId}`),
      redis.del(`force-disconnect:${userId}`)
    ];

    // If room exists and user is alone, delete it
    if (roomName && reason === 'room_deleted') {
      // Room is already deleted, just clean up state
      await Promise.all(cleanupOps);
    } else if (roomName) {
      // Delete the room if it exists
      try {
        await deleteRoom(roomName);
        console.log(`[KickAlone] Deleted room ${roomName}`);
      } catch (error) {
        console.error('[KickAlone] Error deleting room:', error);
      }
      await Promise.all(cleanupOps);
    }

    // Maintain user's heartbeat for re-queuing
    const now = Date.now();
    await redis.setex(`heartbeat:${userId}`, 30, now.toString());

    // Add grace period for re-queuing
    await redis.setex(`requeue-grace:${userId}`, 5, 'true');

    // Small delay to ensure cleanup propagates
    await new Promise(resolve => setTimeout(resolve, 100));

    // Re-add user to queue
    await redis.zadd('matching:waiting', now, userId);
    
    console.log(`[KickAlone] User ${userId} cleaned up and re-queued`);

    return NextResponse.json({
      success: true,
      message: 'User kicked and re-queued',
      requeued: true
    });

  } catch (error) {
    console.error('[KickAlone] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}