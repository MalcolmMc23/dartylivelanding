import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST() {
  try {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds
    
    // Get all users in the waiting queue
    const waitingUsers = await redis.zrange('matching:waiting', 0, -1, 'WITHSCORES');
    
    let removedCount = 0;
    
    // Check each user's heartbeat
    for (let i = 0; i < waitingUsers.length; i += 2) {
      const userId = waitingUsers[i];
      const heartbeat = await redis.get(`heartbeat:${userId}`);
      
      if (!heartbeat || (now - parseInt(heartbeat)) > staleThreshold) {
        // Remove stale user from queue
        console.log(`[Cleanup] Removing stale user ${userId} from waiting queue`);
        await redis.zrem('matching:waiting', userId);
        await redis.del(`heartbeat:${userId}`);
        removedCount++;
      }
    }
    
    // Also clean up users in call who have stale heartbeats
    const inCallUsers = await redis.zrange('matching:in_call', 0, -1);
    
    for (const userId of inCallUsers) {
      const heartbeat = await redis.get(`heartbeat:${userId}`);
      
      if (!heartbeat || (now - parseInt(heartbeat)) > staleThreshold) {
        await redis.zrem('matching:in_call', userId);
        await redis.del(`match:${userId}`);
        await redis.del(`heartbeat:${userId}`);
        removedCount++;
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      cleaned: removedCount 
    });
  } catch (error) {
    console.error('Error in cleanup:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}