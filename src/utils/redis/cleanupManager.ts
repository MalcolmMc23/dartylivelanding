import redis from '../../lib/redis';
import { ACTIVE_MATCHES } from './constants';

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

export async function cleanupRoom(roomName: string) {
  console.log(`Cleaning up room: ${roomName}`);
  
  try {
    // Remove from active matches
    await redis.hdel(ACTIVE_MATCHES, roomName);
    
    // Remove from room states and participants (if using room sync)
    await redis.hdel('rooms:states', roomName);
    await redis.hdel('rooms:participants', roomName);
    
    console.log(`Successfully cleaned up room: ${roomName}`);
    return { status: 'cleaned' };
  } catch (error) {
    console.error(`Error cleaning up room ${roomName}:`, error);
    return { status: 'error', error: String(error) };
  }
} 