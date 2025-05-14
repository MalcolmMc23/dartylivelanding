import redis, { safeRedisOperation } from '../lib/redis';

// Queue names
const WAITING_QUEUE = 'matching:waiting';
const IN_CALL_QUEUE = 'matching:in_call';
const ACTIVE_MATCHES = 'matching:active';
const USED_ROOM_NAMES = 'matching:used_room_names'; // Track used room names to prevent reuse

// Helper to generate a unique room name
async function generateUniqueRoomName() {
  // Try to generate a unique room name
  let attempts = 0;
  let roomName;
  
  do {
    roomName = `match-${Math.random().toString(36).substring(2, 10)}`;
    const exists = await redis.sismember(USED_ROOM_NAMES, roomName);
    
    if (!exists) {
      // Add to the set of used room names
      await redis.sadd(USED_ROOM_NAMES, roomName);
      // Set expiration on this name (24 hours)
      await redis.expire(USED_ROOM_NAMES, 24 * 60 * 60);
      return roomName;
    }
    
    attempts++;
  } while (attempts < 10); // Prevent infinite loops
  
  // Fallback with timestamp if we somehow can't get a unique name
  roomName = `match-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
  await redis.sadd(USED_ROOM_NAMES, roomName);
  return roomName;
}

export async function addUserToQueue(
  username: string,
  useDemo: boolean,
  inCall = false,
  roomName?: string,
  lastMatch?: { matchedWith: string }
) {
  const userData = JSON.stringify({
    username,
    useDemo,
    inCall,
    roomName,
    joinedAt: Date.now(),
    lastMatch: lastMatch ? {
      matchedWith: lastMatch.matchedWith,
      timestamp: Date.now()
    } : undefined
  });

  // First remove user from any queue they might be in
  await removeUserFromQueue(username);

  // Add to appropriate queue with score as join time for sorting
  const queueKey = inCall ? IN_CALL_QUEUE : WAITING_QUEUE;
  await redis.zadd(queueKey, Date.now(), userData);
  
  console.log(`Added ${username} to ${inCall ? 'in-call' : 'waiting'} queue`);
  return { username, added: true };
}

export async function removeUserFromQueue(username: string) {
  // Need to scan both queues to find user by username in the JSON
  const result1 = await scanQueueForUser(WAITING_QUEUE, username);
  const result2 = await scanQueueForUser(IN_CALL_QUEUE, username);
  
  let removed = false;
  
  if (result1) {
    await redis.zrem(WAITING_QUEUE, result1);
    removed = true;
  }
  
  if (result2) {
    await redis.zrem(IN_CALL_QUEUE, result2);
    removed = true;
  }
  
  if (removed) {
    console.log(`Removed ${username} from queue`);
  }
  
  return removed;
}

// Helper to find user data in a queue
async function scanQueueForUser(queueKey: string, username: string): Promise<string | undefined> {
  const allMembers = await redis.zrange(queueKey, 0, -1);
  return allMembers.find((member: string) => {
    try {
      const data = JSON.parse(member);
      return data.username === username;
    } catch {
      return false;
    }
  });
}

export async function findMatchForUser(username: string, useDemo: boolean, lastMatchedWith?: string) {
  // First try to match with someone already in a call (priority)
  const inCallUsers = await redis.zrange(IN_CALL_QUEUE, 0, -1);
  
  for (const userData of inCallUsers) {
    try {
      const user = JSON.parse(userData);
      
      // Skip if this is the user we just left
      if (lastMatchedWith && user.username === lastMatchedWith) continue;
      
      // Skip if we recently matched with this user (5-min cooldown)
      if (user.lastMatch?.matchedWith === username && 
          (Date.now() - user.lastMatch.timestamp < 5 * 60 * 1000)) continue;
      
      // We found a match!
      await removeUserFromQueue(user.username);
      
      // Make sure we have a valid room name
      let roomName = user.roomName;
      if (!roomName) {
        roomName = await generateUniqueRoomName();
      }
      
      // Create match record
      const matchData = {
        user1: username,
        user2: user.username,
        roomName,
        useDemo: useDemo || user.useDemo,
        matchedAt: Date.now()
      };
      
      await redis.hset(ACTIVE_MATCHES, matchData.roomName, JSON.stringify(matchData));
      
      return {
        status: 'matched',
        roomName: matchData.roomName,
        matchedWith: user.username,
        useDemo: useDemo || user.useDemo
      };
    } catch (e) {
      console.error('Error processing user data:', e);
    }
  }
  
  // If no in-call matches, try regular waiting users
  const waitingUsers = await redis.zrange(WAITING_QUEUE, 0, -1);
  
  for (const userData of waitingUsers) {
    try {
      const user = JSON.parse(userData);
      
      if (user.username === username) continue; // Skip ourselves
      
      // Skip if this is the user we just left
      if (lastMatchedWith && user.username === lastMatchedWith) continue;
      
      // Skip if we recently matched with this user
      if (user.lastMatch?.matchedWith === username &&
          (Date.now() - user.lastMatch.timestamp < 5 * 60 * 1000)) continue;
      
      // We found a match!
      await removeUserFromQueue(user.username);
      
      // Generate new room name
      const roomName = await generateUniqueRoomName();
      
      // Create match record
      const matchData = {
        user1: username,
        user2: user.username,
        roomName,
        useDemo: useDemo || user.useDemo,
        matchedAt: Date.now()
      };
      
      await redis.hset(ACTIVE_MATCHES, roomName, JSON.stringify(matchData));
      
      return {
        status: 'matched',
        roomName,
        matchedWith: user.username,
        useDemo: useDemo || user.useDemo
      };
    } catch (e) {
      console.error('Error processing user data:', e);
    }
  }
  
  // No match found, add user to waiting queue
  await addUserToQueue(username, useDemo);
  
  return { status: 'waiting' };
}

// Handle user disconnection
export async function handleUserDisconnection(username: string, roomName: string, otherUsername?: string) {
  // Get match data
  const matchData = await redis.hget(ACTIVE_MATCHES, roomName);
  
  if (!matchData) {
    return { status: 'no_match_found' };
  }
  
  try {
    const match = JSON.parse(matchData as string);
    
    // Remove match from active matches
    await redis.hdel(ACTIVE_MATCHES, roomName);
    
    // Determine who was left behind
    let leftBehindUser = otherUsername;
    if (!leftBehindUser) {
      leftBehindUser = match.user1 === username ? match.user2 : match.user1;
    }
    
    if (leftBehindUser) {
      // Add left-behind user back to queue with in_call=true
      await addUserToQueue(leftBehindUser, match.useDemo, true, roomName, {
        matchedWith: username
      });
    }
    
    return {
      status: 'disconnected',
      leftBehindUser,
      users: [match.user1, match.user2]
    };
  } catch (e) {
    console.error('Error processing match data:', e);
    return { status: 'error', error: String(e) };
  }
}

// Cleanup functions
export async function cleanupOldWaitingUsers() {
  const maxWaitTime = Date.now() - (5 * 60 * 1000); // 5 minutes ago
  
  // Remove users who joined more than 5 minutes ago
  const removedCount = await redis.zremrangebyscore(WAITING_QUEUE, 0, maxWaitTime);
  const removedInCallCount = await redis.zremrangebyscore(IN_CALL_QUEUE, 0, maxWaitTime);
  
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

// Get waiting queue status
export async function getWaitingQueueStatus(username: string) {
  // Check if user has been matched
  const allMatches = await redis.hgetall(ACTIVE_MATCHES);
  
  for (const [roomName, matchData] of Object.entries(allMatches)) {
    try {
      const match = JSON.parse(matchData as string);
      if (match.user1 === username || match.user2 === username) {
        return {
          status: 'matched',
          roomName,
          matchedWith: match.user1 === username ? match.user2 : match.user1,
          useDemo: match.useDemo
        };
      }
    } catch (e) {
      console.error('Error processing match data:', e);
    }
  }
  
  // Check if user is in waiting queue
  const waitingUserData = await scanQueueForUser(WAITING_QUEUE, username);
  const inCallUserData = await scanQueueForUser(IN_CALL_QUEUE, username);
  
  if (waitingUserData || inCallUserData) {
    const waitingUsers = await redis.zrange(WAITING_QUEUE, 0, -1, 'WITHSCORES');
    const position = waitingUserData ? 
      Math.floor(waitingUsers.indexOf(waitingUserData) / 2) + 1 :
      null;
    
    return {
      status: 'waiting',
      position,
      queueSize: Math.floor(waitingUsers.length / 2) // WITHSCORES returns [member, score] pairs
    };
  }
  
  return { status: 'not_waiting' };
} 