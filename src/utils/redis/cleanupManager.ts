import redis from '../../lib/redis';
import { WAITING_QUEUE, IN_CALL_QUEUE, ACTIVE_MATCHES } from './constants';

export async function cleanupOldWaitingUsers() {
  // Regular waiting users timeout after 5 minutes
  const maxWaitTime = Date.now() - (5 * 60 * 1000); 
  
  // In-call users have a longer timeout (15 minutes) since we want to prioritize matching them
  const maxInCallWaitTime = Date.now() - (15 * 60 * 1000);
  
  // Remove users who joined more than 5 minutes ago from waiting queue
  const removedCount = await redis.zremrangebyscore(WAITING_QUEUE, 0, maxWaitTime);
  
  // Remove users from in-call queue with a more generous timeout
  const removedInCallCount = await redis.zremrangebyscore(IN_CALL_QUEUE, 0, maxInCallWaitTime);
  
  if (removedCount > 0 || removedInCallCount > 0) {
    console.log(`Cleaned up ${removedCount} waiting users and ${removedInCallCount} in-call users`);
  }
  
  return { removedCount, removedInCallCount };
}

export async function cleanupOldMatches() {
  const maxMatchTime = Date.now() - (10 * 60 * 1000); // 10 minutes ago
  
  // Get all matches
  const allMatches = await redis.hgetall(ACTIVE_MATCHES);
  let removedCount = 0;
  
  for (const [roomName, matchData] of Object.entries(allMatches)) {
    try {
      const match = JSON.parse(matchData as string);
      
      if (match.matchedAt < maxMatchTime) {
        await redis.hdel(ACTIVE_MATCHES, roomName);
        removedCount++;
      }
    } catch (e) {
      console.error('Error cleaning up match:', e);
    }
  }
  
  if (removedCount > 0) {
    console.log(`Cleaned up ${removedCount} stale matches`);
  }
  
  return { removedCount };
} 