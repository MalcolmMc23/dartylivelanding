import redis from '../../lib/redis';
import { USED_ROOM_NAMES, ACTIVE_MATCHES } from './constants';

// Helper to generate a unique room name
export async function generateUniqueRoomName() {
  // Try to generate a unique room name
  let attempts = 0;
  let roomName;
  
  // Include timestamp in the room name to ensure uniqueness
  const timestamp = Date.now().toString(36); 
  
  do {
    // Combine timestamp with random string for guaranteed uniqueness
    roomName = `match-${timestamp}-${Math.random().toString(36).substring(2, 8)}`;
    const exists = await redis.sismember(USED_ROOM_NAMES, roomName);
    
    if (!exists) {
      // Add to the set of used room names
      await redis.sadd(USED_ROOM_NAMES, roomName);
      // Set expiration on this name (24 hours)
      await redis.expire(USED_ROOM_NAMES, 24 * 60 * 60);
      console.log(`Generated new unique room name: ${roomName}`);
      return roomName;
    }
    
    attempts++;
  } while (attempts < 10); // Prevent infinite loops
  
  // Fallback with more precise timestamp if we somehow can't get a unique name
  roomName = `match-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
  await redis.sadd(USED_ROOM_NAMES, roomName);
  console.log(`Generated fallback room name: ${roomName}`);
  return roomName;
}

// Get information about a room
export async function getRoomInfo(roomName: string) {
  if (!roomName) {
    return { isActive: false };
  }
  
  // Get match data from active matches
  const matchData = await redis.hget(ACTIVE_MATCHES, roomName);
  
  if (!matchData) {
    return { isActive: false };
  }
  
  try {
    const match = JSON.parse(matchData as string);
    return {
      isActive: true,
      users: [match.user1, match.user2],
      matchedAt: match.matchedAt,
      useDemo: match.useDemo,
      roomName
    };
  } catch (e) {
    console.error('Error processing match data:', e);
    return { isActive: false, error: String(e) };
  }
} 