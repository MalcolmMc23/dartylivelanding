import redis from '../../lib/redis';
import { MATCHING_QUEUE, ACTIVE_MATCHES, WAITING_QUEUE, IN_CALL_QUEUE } from './constants';
import { UserQueueState, UserDataInQueue } from './types';
import { Mutex } from 'async-mutex';

// Create a mutex for queue operations to prevent race conditions
const queueMutex = new Mutex();

export async function addUserToQueue(
  username: string,
  useDemo: boolean,
  state: UserQueueState = 'waiting',
  roomName?: string,
  lastMatch?: { matchedWith: string }
) {
  // Acquire mutex to ensure atomic operation
  const release = await queueMutex.acquire();
  
  try {
    const now = Date.now();
    
    // Validate inputs to prevent negative numbers or invalid data
    if (!username || typeof username !== 'string') {
      console.error('Invalid username provided to addUserToQueue:', username);
      return { username: '', added: false, state, reason: 'invalid_username' };
    }
    
    if (now < 0 || !Number.isFinite(now)) {
      console.error('Invalid timestamp generated:', now);
      return { username, added: false, state, reason: 'invalid_timestamp' };
    }
    
    // Clean up any corrupted data for this user first
    await cleanupCorruptedUserData(username);
    
    // Check if user is already in queue to prevent duplicates
    const existingUserData = await scanQueueForUser(MATCHING_QUEUE, username);
    if (existingUserData) {
      try {
        const existingUser = JSON.parse(existingUserData) as UserDataInQueue;
        // If user is already in queue with same state, just update timestamp
        if (existingUser.state === state && existingUser.roomName === roomName) {
          console.log(`User ${username} already in queue with same state '${state}', not duplicating`);
          return { username, added: false, state: existingUser.state, reason: 'already_in_queue_same_state' };
        }
        // If user is in 'in_call' state and we're trying to add as 'waiting', skip
        if (existingUser.state === 'in_call' && state === 'waiting') {
          console.log(`User ${username} is in 'in_call' state, not downgrading to 'waiting'`);
          return { username, added: false, state: existingUser.state, reason: 'already_in_better_state' };
        }
        // Remove existing entry to update with new state
        console.log(`Updating ${username} from ${existingUser.state} to ${state}`);
        await redis.zrem(MATCHING_QUEUE, existingUserData);
      } catch (e) {
        console.error('Error parsing existing user data:', e);
        // Remove corrupted entry
        await redis.zrem(MATCHING_QUEUE, existingUserData);
      }
    }
    
    // Also check if user is in an active match
    const activeMatch = await checkUserInActiveMatch(username);
    if (activeMatch) {
      console.log(`User ${username} is already in an active match in room ${activeMatch.roomName}, not adding to queue`);
      return { username, added: false, state: 'matched', reason: 'already_matched' };
    }
    
    // Construct user data using the new structure
    const userData: UserDataInQueue = {
      username,
      useDemo,
      state,
      roomName,
      joinedAt: now,
      lastMatch: lastMatch ? {
        matchedWith: lastMatch.matchedWith,
        timestamp: now
      } : undefined
    };

    // Remove user from any legacy queues they might be in
    await removeUserFromLegacyQueues(username);

    // Add to the new unified queue using timestamp as score (FIFO ordering)
    const userDataString = JSON.stringify(userData);
    await redis.zadd(MATCHING_QUEUE, now, userDataString);
    
    console.log(`Successfully added ${username} to matching queue with state '${state}' at timestamp ${now}`);
    
    return { username, added: true, state };
  } finally {
    release();
  }
}

export async function removeUserFromQueue(username: string) {
  // Acquire mutex to ensure atomic operation
  const release = await queueMutex.acquire();
  
  try {
    let removed = false;
    
    // Check the new unified queue
    const result = await scanQueueForUser(MATCHING_QUEUE, username);
    if (result) {
      await redis.zrem(MATCHING_QUEUE, result);
      removed = true;
    }
    
    // For backward compatibility - also check legacy queues
    const result1 = await scanQueueForUser(WAITING_QUEUE, username);
    const result2 = await scanQueueForUser(IN_CALL_QUEUE, username);
    
    if (result1) {
      await redis.zrem(WAITING_QUEUE, result1);
      removed = true;
    }
    
    if (result2) {
      await redis.zrem(IN_CALL_QUEUE, result2);
      removed = true;
    }
    
    if (removed) {
      console.log(`Successfully removed ${username} from queue system`);
    }
    
    return removed;
  } finally {
    release();
  }
}

// Helper to check if user is in an active match
async function checkUserInActiveMatch(username: string): Promise<{ roomName: string; matchedWith: string } | null> {
  const allMatches = await redis.hgetall(ACTIVE_MATCHES);
  
  for (const [roomName, matchData] of Object.entries(allMatches)) {
    try {
      const match = JSON.parse(matchData as string);
      if (match.user1 === username || match.user2 === username) {
        return {
          roomName,
          matchedWith: match.user1 === username ? match.user2 : match.user1
        };
      }
    } catch (e) {
      console.error('Error parsing match data:', e);
    }
  }
  
  return null;
}

// Helper to remove user from legacy queues
async function removeUserFromLegacyQueues(username: string): Promise<void> {
  const legacyQueues = [WAITING_QUEUE, IN_CALL_QUEUE];
  
  for (const queueKey of legacyQueues) {
    const userData = await scanQueueForUser(queueKey, username);
    if (userData) {
      await redis.zrem(queueKey, userData);
      console.log(`Removed ${username} from legacy queue ${queueKey}`);
    }
  }
}

// Helper to find user data in a queue
export async function scanQueueForUser(queueKey: string, username: string): Promise<string | undefined> {
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

// Get user's current status in the queue system
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
    } catch {
      console.error('Error processing match data');
    }
  }
  
  // Check if user is in the new unified queue
  const userData = await scanQueueForUser(MATCHING_QUEUE, username);
  
  if (userData) {
    try {
      const userInfo = JSON.parse(userData) as UserDataInQueue;
      
      // Calculate position (approximate) if needed
      let position = 0;
      let queueSize = 0;
      
      if (userInfo.state === 'waiting') {
        const allUsers = await redis.zrange(MATCHING_QUEUE, 0, -1);
        // Find users with similar state and get position
        const waitingUserItems = [];
        for (const userData of allUsers) {
          try {
            const user = JSON.parse(userData);
            if (user.state === 'waiting') {
              waitingUserItems.push(user);
            }
          } catch {
            // Skip invalid entries
          }
        }
        position = waitingUserItems.findIndex(u => u.username === username) + 1;
        queueSize = waitingUserItems.length;
      }
      
      return {
        status: userInfo.state,
        roomName: userInfo.roomName,
        useDemo: userInfo.useDemo,
        joinedAt: userInfo.joinedAt,
        position: position > 0 ? position : undefined,
        queueSize: queueSize > 0 ? queueSize : undefined
      };
    } catch {
      console.error('Error parsing user data from queue');
      // Fallback with limited info if parsing fails
      return {
        status: 'in_queue'
      };
    }
  }
  
  // Fallback to legacy queue checks for transition period
  const waitingUserData = await scanQueueForUser(WAITING_QUEUE, username);
  if (waitingUserData) {
    try {
      const userInfo = JSON.parse(waitingUserData);
      return {
        status: 'waiting',
        useDemo: userInfo.useDemo
      };
    } catch {
      return { status: 'waiting' };
    }
  }
  
  const inCallUserData = await scanQueueForUser(IN_CALL_QUEUE, username);
  if (inCallUserData) {
    try {
      const userInfo = JSON.parse(inCallUserData);
      return {
        status: 'in_call',
        roomName: userInfo.roomName,
        useDemo: userInfo.useDemo
      };
    } catch {
      return { status: 'in_call' };
    }
  }
  
  return { status: 'not_waiting' };
}

async function cleanupCorruptedUserData(username: string): Promise<void> {
  try {
    // Remove any corrupted entries from all queues
    const allQueues = [MATCHING_QUEUE, WAITING_QUEUE, IN_CALL_QUEUE];
    
    for (const queueKey of allQueues) {
      const allMembers = await redis.zrange(queueKey, 0, -1);
      
      for (const member of allMembers) {
        try {
          const data = JSON.parse(member);
          
          // Check for corrupted data (negative timestamps, invalid usernames, etc.)
          if (data.username === username && 
              (data.joinedAt < 0 || !Number.isFinite(data.joinedAt) || !data.username)) {
            console.log(`Removing corrupted data for ${username} from ${queueKey}`);
            await redis.zrem(queueKey, member);
          }
        } catch {
          // Remove unparseable data
          console.log(`Removing unparseable data from ${queueKey}:`, member);
          await redis.zrem(queueKey, member);
        }
      }
    }
  } catch (error) {
    console.error(`Error cleaning up corrupted data for ${username}:`, error);
  }
} 