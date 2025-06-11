import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST() {
  try {
    const now = Date.now();
    const primaryStaleThreshold = 10000; // 10 seconds
    const secondaryStaleThreshold = 30000; // 30 seconds
    
    // Get all users in the waiting queue
    const waitingKeys = await redis.keys('matching:waiting_*');
    let removedCount = 0;
    
    // Check each user's heartbeats
    for (const key of waitingKeys) {
      const userId = key.replace('matching:waiting_', '');
      const [primaryHeartbeat, secondaryHeartbeat] = await Promise.all([
        redis.get(`heartbeat:primary:${userId}`),
        redis.get(`heartbeat:secondary:${userId}`)
      ]);
      
      // Check if user has a grace period (just requeued)
      const hasGracePeriod = await redis.get(`requeue-grace:${userId}`);
      
      const isPrimaryStale = !primaryHeartbeat || (now - parseInt(primaryHeartbeat)) > primaryStaleThreshold;
      const isSecondaryStale = !secondaryHeartbeat || (now - parseInt(secondaryHeartbeat)) > secondaryStaleThreshold;
      
      if (!hasGracePeriod && (isPrimaryStale || isSecondaryStale)) {
        // Remove stale user from queue
        console.log(`[Cleanup] Removing stale user ${userId} from waiting queue (primary: ${isPrimaryStale}, secondary: ${isSecondaryStale})`);
        await Promise.all([
          redis.del(`matching:waiting_${userId}`),
          redis.del(`heartbeat:primary:${userId}`),
          redis.del(`heartbeat:secondary:${userId}`)
        ]);
        removedCount++;
      } else if (hasGracePeriod) {
        console.log(`[Cleanup] Skipping ${userId} - has grace period after requeue`);
      }
    }
    
    // Also clean up users in call who have stale heartbeats
    const inCallUsers = await redis.zrange('matching:in_call', 0, -1);
    
    for (const userId of inCallUsers) {
      const [primaryHeartbeat, secondaryHeartbeat] = await Promise.all([
        redis.get(`heartbeat:primary:${userId}`),
        redis.get(`heartbeat:secondary:${userId}`)
      ]);
      
      const isPrimaryStale = !primaryHeartbeat || (now - parseInt(primaryHeartbeat)) > primaryStaleThreshold;
      const isSecondaryStale = !secondaryHeartbeat || (now - parseInt(secondaryHeartbeat)) > secondaryStaleThreshold;
      
      if (isPrimaryStale || isSecondaryStale) {
        await Promise.all([
          redis.zrem('matching:in_call', userId),
          redis.del(`match:${userId}`),
          redis.del(`heartbeat:primary:${userId}`),
          redis.del(`heartbeat:secondary:${userId}`)
        ]);
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