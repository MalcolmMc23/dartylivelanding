import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

// Constants for heartbeat timing
const PRIMARY_HEARTBEAT_TTL = 10; // 10 seconds
const SECONDARY_HEARTBEAT_TTL = 30; // 30 seconds

export async function POST(request: Request) {
  try {
    const { userId, isPrimary = true, isDisconnecting = false } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    if (isDisconnecting) {
      console.log(`[Heartbeat] User ${userId} is disconnecting. Cleaning up...`);
      await Promise.all([
        redis.zrem('matching:waiting', userId),
        redis.zrem('matching:in_call', userId), // Also remove from in_call if they were there
        redis.del(`heartbeat:primary:${userId}`),
        redis.del(`heartbeat:secondary:${userId}`),
        redis.del(`match:${userId}`), // Clear any active match data
        redis.del(`force-disconnect:${userId}`), // Clear any force disconnect flags
        redis.del(`requeue-grace:${userId}`) // Clear requeue grace if active
      ]);
      return NextResponse.json({ success: true, message: 'User disconnected and cleaned up' });
    }

    const timestamp = Date.now();

    // Update both primary and secondary heartbeats
    if (isPrimary) {
      // Primary heartbeat - more frequent, shorter TTL
      await redis.setex(`heartbeat:primary:${userId}`, PRIMARY_HEARTBEAT_TTL, timestamp.toString());
    } else {
      // Secondary heartbeat - less frequent, longer TTL
      await redis.setex(`heartbeat:secondary:${userId}`, SECONDARY_HEARTBEAT_TTL, timestamp.toString());
    }

    // Check if user is in queue
    const inQueue = await redis.zscore('matching:waiting', userId);
    if (inQueue !== null) {
      // Verify both heartbeats are active before keeping in queue
      const [primaryHeartbeat, secondaryHeartbeat] = await Promise.all([
        redis.get(`heartbeat:primary:${userId}`),
        redis.get(`heartbeat:secondary:${userId}`)
      ]);

      if (primaryHeartbeat && secondaryHeartbeat) {
        // Both heartbeats are active, update queue position
        await redis.zadd('matching:waiting', parseInt(inQueue), userId);
      } else {
        // One or both heartbeats are inactive, remove from queue
        await redis.zrem('matching:waiting', userId);
        return NextResponse.json({ 
          success: true, 
          removedFromQueue: true,
          reason: 'Inactive heartbeat detected'
        });
      }
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

// Helper function to check if a user is active
// async function isUserActive(userId: string): Promise<boolean> {
//   try {
//     const [primaryHeartbeat, secondaryHeartbeat] = await Promise.all([
//       redis.get(`heartbeat:primary:${userId}`),
//       redis.get(`heartbeat:secondary:${userId}`)
//     ]);

//     return !!(primaryHeartbeat && secondaryHeartbeat);
//   } catch (error) {
//     console.error('Error checking user activity:', error);
//     return false;
//   }
// }