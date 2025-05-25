import redis from '../../lib/redis';
import { generateUniqueRoomName } from './roomManager';
import { canRematch, recordCooldown } from './rematchCooldown';
import { stopTrackingUserAlone } from './aloneUserManager';

// Simple Redis keys for the new system
const SIMPLE_QUEUE = 'simple:waiting_queue';
const SIMPLE_MATCHES = 'simple:active_matches';

export interface SimpleUser {
  username: string;
  useDemo: boolean;
  joinedAt: number;
}

export interface SimpleMatch {
  user1: string;
  user2: string;
  roomName: string;
  useDemo: boolean;
  matchedAt: number;
}

export interface SimpleMatchResult {
  status: 'matched' | 'waiting' | 'error';
  roomName?: string;
  matchedWith?: string;
  useDemo?: boolean;
  position?: number;
  error?: string;
}

/**
 * Add user to waiting queue
 * This is the ONLY way users enter the system
 */
export async function addToQueue(username: string, useDemo: boolean): Promise<SimpleMatchResult> {
  try {
    console.log(`Adding ${username} to simple queue`);
    
    // Remove user from any existing states first
    await cleanupUser(username);
    
    // Create user data
    const userData: SimpleUser = {
      username,
      useDemo,
      joinedAt: Date.now()
    };
    
    // Add to queue with timestamp as score for FIFO ordering
    await redis.zadd(SIMPLE_QUEUE, userData.joinedAt, JSON.stringify(userData));
    
    console.log(`${username} added to queue successfully`);
    return { status: 'waiting' };
  } catch (error) {
    console.error(`Error adding ${username} to queue:`, error);
    return { status: 'error', error: String(error) };
  }
}

/**
 * Find match for a user - tries to match immediately with someone in queue
 */
export async function findMatch(username: string, useDemo: boolean): Promise<SimpleMatchResult> {
  try {
    console.log(`Finding match for ${username}`);
    
    // First check if user is already matched
    const existingMatch = await checkExistingMatch(username);
    if (existingMatch) {
      console.log(`${username} already matched with ${existingMatch.matchedWith}`);
      return existingMatch;
    }
    
    // Get all users from queue (oldest first)
    const queuedUsers = await redis.zrange(SIMPLE_QUEUE, 0, -1, 'WITHSCORES');
    console.log(`Found ${queuedUsers.length / 2} users in queue`);
    
    // Parse queue users
    const availableUsers: SimpleUser[] = [];
    for (let i = 0; i < queuedUsers.length; i += 2) {
      try {
        const userData = JSON.parse(queuedUsers[i]);
        // Skip self and check cooldown
        if (userData.username !== username && await canMatch(username, userData.username)) {
          availableUsers.push(userData);
        }
      } catch (e) {
        console.error('Error parsing queued user:', e);
      }
    }
    
    if (availableUsers.length === 0) {
      // No one available, add to queue
      console.log(`No available matches for ${username}, adding to queue`);
      return await addToQueue(username, useDemo);
    }
    
    // Match with the first available user (oldest in queue)
    const matchedUser = availableUsers[0];
    console.log(`Matching ${username} with ${matchedUser.username}`);
    
    // Remove both users from queue
    await removeFromQueue(username);
    await removeFromQueue(matchedUser.username);
    
    // Stop tracking both users as alone since they're being matched
    await stopTrackingUserAlone(username);
    await stopTrackingUserAlone(matchedUser.username);
    
    // Create room and match
    const roomName = await generateUniqueRoomName();
    const match: SimpleMatch = {
      user1: username,
      user2: matchedUser.username,
      roomName,
      useDemo: useDemo || matchedUser.useDemo,
      matchedAt: Date.now()
    };
    
    // Store the active match
    await redis.hset(SIMPLE_MATCHES, roomName, JSON.stringify(match));
    
    console.log(`Created match: ${username} <-> ${matchedUser.username} in room ${roomName}`);
    
    return {
      status: 'matched',
      roomName,
      matchedWith: matchedUser.username,
      useDemo: match.useDemo
    };
    
  } catch (error) {
    console.error(`Error finding match for ${username}:`, error);
    return { status: 'error', error: String(error) };
  }
}

/**
 * Handle SKIP - both users go back to queue with cooldown
 */
export async function handleSkip(username: string, roomName: string): Promise<{ status: string; otherUser?: string }> {
  try {
    console.log(`Handling skip: ${username} from room ${roomName}`);
    
    // Get match data
    const matchData = await redis.hget(SIMPLE_MATCHES, roomName);
    if (!matchData) {
      console.log(`No match found for room ${roomName}`);
      return { status: 'no_match_found' };
    }
    
    const match: SimpleMatch = JSON.parse(matchData);
    const otherUser = match.user1 === username ? match.user2 : match.user1;
    
    console.log(`Skip: ${username} and ${otherUser} will both go back to queue`);
    
    // Remove the match FIRST to prevent race conditions
    await redis.hdel(SIMPLE_MATCHES, roomName);
    
    // Set cooldown between these users (5 minutes)
    await setSkipCooldown(username, otherUser);
    
    // Both users go back to queue simultaneously
    await Promise.all([
      addToQueue(username, match.useDemo),
      addToQueue(otherUser, match.useDemo)
    ]);
    
    console.log(`Skip completed: both users back in queue`);
    return { status: 'skipped', otherUser };
    
  } catch (error) {
    console.error(`Error handling skip for ${username}:`, error);
    return { status: 'error' };
  }
}

/**
 * Handle END CALL - user who clicked goes to main screen, other goes to queue
 */
export async function handleEndCall(username: string, roomName: string): Promise<{ status: string; otherUser?: string }> {
  try {
    console.log(`Handling end call: ${username} from room ${roomName}`);
    
    // Get match data
    const matchData = await redis.hget(SIMPLE_MATCHES, roomName);
    if (!matchData) {
      console.log(`No match found for room ${roomName}`);
      return { status: 'no_match_found' };
    }
    
    const match: SimpleMatch = JSON.parse(matchData);
    const otherUser = match.user1 === username ? match.user2 : match.user1;
    
    console.log(`End call: ${username} goes to main screen, ${otherUser} goes to queue`);
    
    // Remove the match FIRST
    await redis.hdel(SIMPLE_MATCHES, roomName);
    
    // Clean up the user who ended the call (they go to main screen)
    await cleanupUser(username);
    
    // Put the other user back in queue
    await addToQueue(otherUser, match.useDemo);
    
    console.log(`End call completed`);
    return { status: 'ended', otherUser };
    
  } catch (error) {
    console.error(`Error handling end call for ${username}:`, error);
    return { status: 'error' };
  }
}

/**
 * Handle unexpected disconnection - other user goes back to queue
 */
export async function handleDisconnection(username: string, roomName: string): Promise<{ status: string; otherUser?: string }> {
  try {
    console.log(`Handling disconnection: ${username} from room ${roomName}`);
    
    // Get match data
    const matchData = await redis.hget(SIMPLE_MATCHES, roomName);
    if (!matchData) {
      console.log(`No match found for room ${roomName}`);
      return { status: 'no_match_found' };
    }
    
    const match: SimpleMatch = JSON.parse(matchData);
    const otherUser = match.user1 === username ? match.user2 : match.user1;
    
    console.log(`Disconnection: ${username} left, ${otherUser} goes back to queue`);
    
    // Remove the match
    await redis.hdel(SIMPLE_MATCHES, roomName);
    
    // Clean up the disconnected user
    await cleanupUser(username);
    
    // Put the other user back in queue
    await addToQueue(otherUser, match.useDemo);
    
    console.log(`Disconnection handled`);
    return { status: 'disconnected', otherUser };
    
  } catch (error) {
    console.error(`Error handling disconnection for ${username}:`, error);
    return { status: 'error' };
  }
}

/**
 * Get user's current status
 */
export async function getUserStatus(username: string): Promise<SimpleMatchResult> {
  try {
    // Check if user is in an active match
    const existingMatch = await checkExistingMatch(username);
    if (existingMatch) {
      return existingMatch;
    }
    
    // Check if user is in queue
    const queuedUsers = await redis.zrange(SIMPLE_QUEUE, 0, -1);
    for (let i = 0; i < queuedUsers.length; i++) {
      try {
        const userData: SimpleUser = JSON.parse(queuedUsers[i]);
        if (userData.username === username) {
          // Calculate position in queue
          const position = i + 1;
          return { 
            status: 'waiting', 
            position,
            useDemo: userData.useDemo 
          };
        }
      } catch (e) {
        console.error('Error parsing queue user:', e);
      }
    }
    
    // User not found anywhere
    return { status: 'waiting', position: 0 };
    
  } catch (error) {
    console.error(`Error getting status for ${username}:`, error);
    return { status: 'error', error: String(error) };
  }
}

/**
 * Cancel/remove user from system
 */
export async function cancelUser(username: string): Promise<{ status: string }> {
  try {
    console.log(`Canceling user ${username}`);
    await cleanupUser(username);
    return { status: 'cancelled' };
  } catch (error) {
    console.error(`Error canceling user ${username}:`, error);
    return { status: 'error' };
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{ waitingCount: number; matchedCount: number; totalUsers: number }> {
  try {
    // Count users in waiting queue
    const waitingCount = await redis.zcard(SIMPLE_QUEUE);
    
    // Count active matches (each match has 2 users)
    const matchCount = await redis.hlen(SIMPLE_MATCHES);
    const matchedCount = matchCount * 2;
    
    // Total users = waiting + matched
    const totalUsers = waitingCount + matchedCount;
    
    return {
      waitingCount,
      matchedCount,
      totalUsers
    };
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return {
      waitingCount: 0,
      matchedCount: 0,
      totalUsers: 0
    };
  }
}

// Helper functions

async function checkExistingMatch(username: string): Promise<SimpleMatchResult | null> {
  const allMatches = await redis.hgetall(SIMPLE_MATCHES);
  
  for (const [roomName, matchData] of Object.entries(allMatches)) {
    try {
      const match: SimpleMatch = JSON.parse(matchData);
      if (match.user1 === username || match.user2 === username) {
        return {
          status: 'matched',
          roomName,
          matchedWith: match.user1 === username ? match.user2 : match.user1,
          useDemo: match.useDemo
        };
      }
    } catch (e) {
      console.error('Error parsing match data:', e);
    }
  }
  
  return null;
}

async function removeFromQueue(username: string): Promise<void> {
  const queuedUsers = await redis.zrange(SIMPLE_QUEUE, 0, -1);
  
  for (const userData of queuedUsers) {
    try {
      const user: SimpleUser = JSON.parse(userData);
      if (user.username === username) {
        await redis.zrem(SIMPLE_QUEUE, userData);
        console.log(`Removed ${username} from queue`);
        break;
      }
    } catch (e) {
      console.error('Error parsing user data during removal:', e);
    }
  }
}

async function cleanupUser(username: string): Promise<void> {
  // Remove from queue
  await removeFromQueue(username);
  
  // Check if user is in any active match and clean up
  const allMatches = await redis.hgetall(SIMPLE_MATCHES);
  for (const [roomName, matchData] of Object.entries(allMatches)) {
    try {
      const match: SimpleMatch = JSON.parse(matchData);
      if (match.user1 === username || match.user2 === username) {
        await redis.hdel(SIMPLE_MATCHES, roomName);
        console.log(`Cleaned up match ${roomName} containing ${username}`);
      }
    } catch (e) {
      console.error('Error cleaning up match:', e);
    }
  }
}

async function canMatch(user1: string, user2: string): Promise<boolean> {
  return await canRematch(user1, user2);
}

async function setSkipCooldown(user1: string, user2: string): Promise<void> {
  await recordCooldown(user1, user2, 'skip');
}

/**
 * Background cleanup function to remove stale data
 */
export async function cleanup(): Promise<void> {
  try {
    console.log('Running simple matching service cleanup');
    
    // Remove users who have been in queue for more than 30 minutes
    const cutoffTime = Date.now() - (30 * 60 * 1000);
    await redis.zremrangebyscore(SIMPLE_QUEUE, 0, cutoffTime);
    
    // Remove matches older than 24 hours
    const allMatches = await redis.hgetall(SIMPLE_MATCHES);
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const [roomName, matchData] of Object.entries(allMatches)) {
      try {
        const match: SimpleMatch = JSON.parse(matchData);
        if (match.matchedAt < oneDayAgo) {
          await redis.hdel(SIMPLE_MATCHES, roomName);
          console.log(`Cleaned up old match: ${roomName}`);
        }
      } catch (e) {
        console.error('Error parsing match during cleanup:', e);
        // Remove invalid match data
        await redis.hdel(SIMPLE_MATCHES, roomName);
      }
    }
    
    console.log('Simple matching service cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
} 