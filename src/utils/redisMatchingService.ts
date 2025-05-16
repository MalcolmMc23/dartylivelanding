import redis from '../lib/redis';

// Queue names
const WAITING_QUEUE = 'matching:waiting';
const IN_CALL_QUEUE = 'matching:in_call';
const ACTIVE_MATCHES = 'matching:active';
const USED_ROOM_NAMES = 'matching:used_room_names'; // Track used room names to prevent reuse
const MATCH_LOCK_KEY = "match_lock";
const LOCK_EXPIRY = 3; // 3 seconds instead of 5

// Helper to generate a unique room name
async function generateUniqueRoomName() {
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

// Modify the acquireMatchLock function to use a more aggressive retry mechanism
async function acquireMatchLock(lockId: string, expiry = LOCK_EXPIRY): Promise<boolean> {
  // Try to set the lock with NX (only if it doesn't exist)
  try {
    // Store the start time for logging
    const startTime = Date.now();
    
    // First attempt
    const result = await redis.set(MATCH_LOCK_KEY, lockId, 'EX', expiry, 'NX');
    if (result === "OK") {
      // Store timestamp when lock was acquired
      await redis.set(`${MATCH_LOCK_KEY}:time`, Date.now().toString(), 'EX', expiry + 5);
      console.log(`Lock ${lockId} acquired on first attempt`);
      return true;
    }
    
    // Implement exponential backoff for retries
    const maxRetries = 3;
    let retryDelay = 200; // Start with 200ms
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      console.log(`Lock acquisition attempt ${attempt + 2} for ${lockId}`);
      
      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay *= 2; // Exponential backoff
      
      // Check if current lock has expired or been held too long
      const lockTime = await redis.get(`${MATCH_LOCK_KEY}:time`);
      const currentLockId = await redis.get(MATCH_LOCK_KEY);
      const currentTime = Date.now();
      
      // Force release if lock has been held for more than 10 seconds
      // or if the lock time record is missing but the lock exists
      if ((lockTime && (currentTime - parseInt(lockTime)) > 10000) || 
          (currentLockId && !lockTime)) {
        console.log(`Force releasing expired lock after ${lockTime ? (currentTime - parseInt(lockTime))/1000 : 'unknown'} seconds`);
        await redis.del(MATCH_LOCK_KEY);
        await redis.del(`${MATCH_LOCK_KEY}:time`);
      }
      
      // Try again to acquire the lock
      const retryResult = await redis.set(MATCH_LOCK_KEY, lockId, 'EX', expiry, 'NX');
      if (retryResult === "OK") {
        // Store timestamp when lock was acquired
        await redis.set(`${MATCH_LOCK_KEY}:time`, Date.now().toString(), 'EX', expiry + 5);
        console.log(`Lock ${lockId} acquired on attempt ${attempt + 2} after ${(Date.now() - startTime)}ms`);
        return true;
      }
    }
    
    console.log(`Failed to acquire lock ${lockId} after ${maxRetries + 1} attempts and ${Date.now() - startTime}ms`);
    return false;
  } catch (error) {
    console.error('Error acquiring lock:', error);
    return false;
  }
}

async function releaseMatchLock(lockId: string): Promise<boolean> {
  try {
    // Check if we're using the fake Redis implementation
    const isFakeRedis = !process.env.REDIS_URL;
    
    if (isFakeRedis) {
      // Simplified fallback for fake Redis without using eval
      const currentLock = await redis.get(MATCH_LOCK_KEY);
      if (currentLock === lockId) {
        await redis.del(MATCH_LOCK_KEY);
        await redis.del(`${MATCH_LOCK_KEY}:time`);
        console.log(`Lock ${lockId} released successfully (fallback method)`);
        return true;
      }
      return false;
    } else {
      // Use Lua script for production Redis
      const script = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          redis.call('del', KEYS[1])
          redis.call('del', KEYS[2])
          return 1
        else
          return 0
        end
      `;
      
      // Execute the script atomically
      const result = await redis.eval(
        script,
        2, // Number of keys
        MATCH_LOCK_KEY, 
        `${MATCH_LOCK_KEY}:time`,
        lockId // ARGV[1]
      );
      
      const released = result === 1;
      if (released) {
        console.log(`Lock ${lockId} released successfully`);
      } else {
        // Check if the lock even exists
        const currentLock = await redis.get(MATCH_LOCK_KEY);
        if (!currentLock) {
          console.log(`Lock ${lockId} was already released by someone else or expired`);
        } else {
          console.log(`Failed to release lock ${lockId} (current lock belongs to ${currentLock})`);
        }
      }
      
      return released;
    }
  } catch (error) {
    console.error(`Error releasing lock ${lockId}:`, error);
    
    // Fallback attempt to release lock in case of script error
    try {
      const currentLock = await redis.get(MATCH_LOCK_KEY);
      if (currentLock === lockId) {
        await redis.del(MATCH_LOCK_KEY);
        await redis.del(`${MATCH_LOCK_KEY}:time`);
        console.log(`Lock ${lockId} released using fallback method`);
        return true;
      }
    } catch (fallbackError) {
      console.error(`Fallback lock release also failed:`, fallbackError);
    }
    
    return false;
  }
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

// Modify the findMatchForUser function to use the lock
export async function findMatchForUser(username: string, useDemo: boolean, lastMatchedWith?: string) {
  // Generate a unique lock ID for this request
  const lockId = `match-${username}-${Date.now()}`;
  let lockAcquired = false;
  
  try {
    // Try to acquire the lock
    lockAcquired = await acquireMatchLock(lockId);
    if (!lockAcquired) {
      console.log(`Couldn't acquire match lock for ${username}, will retry`);
      // Wait a bit and retry once
      await new Promise(resolve => setTimeout(resolve, 500));
      lockAcquired = await acquireMatchLock(lockId);
      if (!lockAcquired) {
        console.log(`Still couldn't acquire match lock for ${username}, adding to queue`);
        // If we still can't get the lock, add the user to the waiting queue and return
        await addUserToQueue(username, useDemo);
        return { status: 'waiting' };
      }
    }
    
    // First check if this user is already in a match
    const existingMatch = await checkExistingMatch(username);
    if (existingMatch) {
      return existingMatch;
    }
    
    // First try to match with someone already in a call (priority)
    const inCallUsers = await redis.zrange(IN_CALL_QUEUE, 0, -1);
    
    console.log(`Looking for match for ${username}. Found ${inCallUsers.length} users in in-call queue`);
    
    for (const userData of inCallUsers) {
      try {
        const user = JSON.parse(userData);
        
        // Skip ourselves if somehow we're in the in-call queue too
        if (user.username === username) continue;
        
        // Skip if this is the user we just left
        if (lastMatchedWith && user.username === lastMatchedWith) {
          console.log(`Skipping recent match ${user.username} for user ${username}`);
          continue;
        }
        
        // Skip if we recently matched with this user (5-min cooldown)
        if (user.lastMatch?.matchedWith === username && 
            (Date.now() - user.lastMatch.timestamp < 5 * 60 * 1000)) {
          console.log(`Skipping ${user.username} due to recent match cooldown`);
          continue;
        }
        
        // We found a match!
        await removeUserFromQueue(user.username);
        
        // Make sure we have a valid room name
        // Important: Use the room name from the in-call user
        // This ensures we join their room correctly
        let roomName = user.roomName;
        if (!roomName) {
          roomName = await generateUniqueRoomName();
          console.log(`No room name found for in-call user ${user.username}, generated new room: ${roomName}`);
        } else {
          console.log(`Using existing room name ${roomName} from in-call user ${user.username}`);
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
        console.log(`Created match: ${username} with ${user.username} in room ${roomName}`);
        
        // Make sure both users are removed from all queues
        await removeUserFromQueue(username);
        
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
        console.log(`Generated new room ${roomName} for match between ${username} and ${user.username}`);
        
        // Create match record
        const matchData = {
          user1: username,
          user2: user.username,
          roomName,
          useDemo: useDemo || user.useDemo,
          matchedAt: Date.now()
        };
        
        await redis.hset(ACTIVE_MATCHES, matchData.roomName, JSON.stringify(matchData));
        console.log(`Created match: ${username} with ${user.username} in room ${roomName}`);
        
        // Make sure both users are removed from all queues
        await removeUserFromQueue(username);
        
        return {
          status: 'matched',
          roomName: matchData.roomName,
          matchedWith: user.username,
          useDemo: useDemo || user.useDemo
        };
      } catch (e) {
        console.error('Error processing waiting user data:', e);
      }
    }
    
    // No match found, make sure the user is in the queue
    await addUserToQueue(username, useDemo);
    
    return { status: 'waiting' };
  } catch (error) {
    console.error('Error in findMatchForUser:', error);
    // Always make sure user is in queue even if there's an error
    try {
      await addUserToQueue(username, useDemo);
    } catch (queueError) {
      console.error('Error adding user to queue after match error:', queueError);
    }
    return { status: 'waiting', error: String(error) };
  } finally {
    // Always release the lock if we acquired it
    if (lockAcquired) {
      await releaseMatchLock(lockId);
    }
  }
}

// Helper function to check if user is already in a match
async function checkExistingMatch(username: string) {
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
  
  return null;
}

// Handle user disconnection
export async function handleUserDisconnection(username: string, roomName: string, otherUsername?: string) {
  // Get match data
  const matchData = await redis.hget(ACTIVE_MATCHES, roomName);
  
  if (!matchData) {
    console.log(`No active match found for room ${roomName}`);
    return { status: 'no_match_found' };
  }
  
  try {
    const match = JSON.parse(matchData as string);
    
    // Determine who was left behind
    let leftBehindUser = otherUsername;
    if (!leftBehindUser) {
      leftBehindUser = match.user1 === username ? match.user2 : match.user1;
    }
    
    console.log(`User ${username} disconnected from ${roomName}. Left-behind user: ${leftBehindUser}`);
    
    // Remove match from active matches
    await redis.hdel(ACTIVE_MATCHES, roomName);
    
    if (leftBehindUser) {
      // Handle the left-behind user with our dedicated function
      const result = await handleLeftBehindUser(
        leftBehindUser,
        roomName,
        username,
        match.useDemo
      );
      
      return {
        status: result.status === 'immediate_match' ? 'disconnected_with_immediate_match' : 'disconnected',
        leftBehindUser,
        users: [match.user1, match.user2],
        newRoomName: result.newRoomName,
        immediateMatch: result.immediateMatch
      };
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
  
  // Check if user is in regular waiting queue
  const waitingUserData = await scanQueueForUser(WAITING_QUEUE, username);
  
  if (waitingUserData) {
    const waitingUsers = await redis.zrange(WAITING_QUEUE, 0, -1, 'WITHSCORES');
    const position = Math.floor(waitingUsers.indexOf(waitingUserData) / 2) + 1;
    
    // Parse user data to extract additional info
    try {
      const userInfo = JSON.parse(waitingUserData);
      return {
        status: 'waiting',
        position,
        queueSize: Math.floor(waitingUsers.length / 2), // WITHSCORES returns [member, score] pairs
        useDemo: userInfo.useDemo
      };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // Fallback if parsing fails
      return {
        status: 'waiting',
        position,
        queueSize: Math.floor(waitingUsers.length / 2)
      };
    }
  }
  
  // Check if user is in in-call queue
  const inCallUserData = await scanQueueForUser(IN_CALL_QUEUE, username);
  
  if (inCallUserData) {
    try {
      const userInfo = JSON.parse(inCallUserData);
      return {
        status: 'in_call',
        roomName: userInfo.roomName,
        useDemo: userInfo.useDemo,
        joinedAt: userInfo.joinedAt
      };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // Fallback if parsing fails
      return {
        status: 'in_call'
      };
    }
  }
  
  return { status: 'not_waiting' };
}

// Handle left-behind user state and matching
async function handleLeftBehindUser(
  leftBehindUser: string, 
  previousRoomName: string, 
  disconnectedUser: string,
  useDemo: boolean
): Promise<{
  status: string, 
  newRoomName?: string, 
  immediateMatch?: { 
    status: string;
    roomName?: string;
    matchedWith?: string;
  }
}> {
  console.log(`Handling left-behind user ${leftBehindUser} after ${disconnectedUser} disconnected`);
  
  // 1. Ensure the user is removed from any existing queue
  await removeUserFromQueue(leftBehindUser);
  
  // 2. Generate a brand new room name
  const newRoomName = await generateUniqueRoomName();
  
  // 3. Store the user's state in a temporary record to ensure consistency
  const leftBehindState: {
    username: string;
    previousRoom: string;
    disconnectedFrom: string;
    newRoomName: string;
    timestamp: number;
    processed: boolean;
    matchedWith?: string;
    matchRoom?: string;
    inQueue?: boolean;
    queueTime?: number;
  } = {
    username: leftBehindUser,
    previousRoom: previousRoomName,
    disconnectedFrom: disconnectedUser,
    newRoomName: newRoomName,
    timestamp: Date.now(),
    processed: false
  };
  
  // Use a unique and consistent key pattern
  await redis.set(
    `left_behind:${leftBehindUser}`, 
    JSON.stringify(leftBehindState),
    'EX', 
    300 // 5 minute expiry
  );
  
  // 4. Try to find an immediate match with much simpler logic
  try {
    const matchResult = await findMatchForUser(
      leftBehindUser,
      useDemo,
      disconnectedUser // Don't match with the user who just left
    );
    
    if (matchResult.status === 'matched') {
      console.log(`Found immediate match for left-behind user ${leftBehindUser} with ${matchResult.matchedWith}`);
      
      // If matched, update the state to record this
      leftBehindState.processed = true;
      leftBehindState.matchedWith = matchResult.matchedWith;
      leftBehindState.matchRoom = matchResult.roomName;
      await redis.set(
        `left_behind:${leftBehindUser}`, 
        JSON.stringify(leftBehindState),
        'EX', 
        300
      );
      
      return {
        status: 'immediate_match',
        newRoomName: matchResult.roomName,
        immediateMatch: matchResult
      };
    }
  } catch (error) {
    console.error(`Error finding immediate match for ${leftBehindUser}:`, error);
  }
  
  // 5. If no immediate match, add to queue with special priority
  try {
    console.log(`No immediate match found for ${leftBehindUser}, adding to in-call queue with room ${newRoomName}`);
    
    // Update state to show they're in queue
    leftBehindState.inQueue = true;
    leftBehindState.queueTime = Date.now();
    await redis.set(
      `left_behind:${leftBehindUser}`, 
      JSON.stringify(leftBehindState),
      'EX', 
      300
    );
    
    // Add to the in-call queue with high priority
    await addUserToQueue(
      leftBehindUser,
      useDemo,
      true, // in-call flag
      newRoomName,
      { matchedWith: disconnectedUser }
    );
    
    return {
      status: 'queued',
      newRoomName
    };
  } catch (error) {
    console.error(`Error adding ${leftBehindUser} to queue:`, error);
    return { status: 'error' };
  }
}