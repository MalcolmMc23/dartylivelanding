import redis from '../../lib/redis';
import { ACTIVE_MATCHES, MATCHING_QUEUE } from './constants';
import { acquireMatchLock, releaseMatchLock } from './lockManager';
import { addUserToQueue, removeUserFromQueue } from './queueManager';
import { generateUniqueRoomName } from './roomManager';
import { UserDataInQueue, ActiveMatch, MatchResult, MatchedResult, WaitingResult, ErrorResult } from './types';
import { canRematch, recordRecentMatch } from './rematchCooldown';

// Helper function to check if user is already in a match
export async function checkExistingMatch(username: string): Promise<MatchedResult | null> {
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

// Main function to find match for a user
export async function findMatchForUser(username: string, useDemo: boolean, lastMatchedWith?: string): Promise<MatchResult> {
  // Generate a unique lock ID for this request
  const lockId = `match-${username}-${Date.now()}`;
  let lockAcquired = false;
  
  try {
    // Try to acquire the lock - acquireMatchLock has its own retry logic
    lockAcquired = await acquireMatchLock(lockId);
    
    if (!lockAcquired) {
      console.log(`Failed to acquire match lock for ${username} after all retries, adding to queue`);
      // If we still can't get the lock, add the user to the waiting queue and return
      await addUserToQueue(username, useDemo, 'waiting');
      return { status: 'waiting' };
    }
    
    // First check if this user is already in a match
    const existingMatch = await checkExistingMatch(username);
    if (existingMatch) {
      return existingMatch;
    }
    
    // Get all users from the unified queue
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
    console.log(`Looking for match for ${username}. Found ${allQueuedUsersRaw.length} users in queue`);
    
    // Parse all users into UserDataInQueue objects
    const allQueuedUsers: UserDataInQueue[] = [];
    for (const userData of allQueuedUsersRaw) {
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        // Skip ourselves
        if (user.username !== username) {
          allQueuedUsers.push(user);
        }
      } catch (e) {
        console.error('Error parsing user data from queue:', e);
      }
    }
    
    // Separate in-call and waiting users
    const inCallUsers = allQueuedUsers.filter(u => u.state === 'in_call')
      .sort((a, b) => a.joinedAt - b.joinedAt); // Sort oldest first
    
    const waitingUsers = allQueuedUsers.filter(u => u.state === 'waiting')
      .sort((a, b) => a.joinedAt - b.joinedAt); // Sort oldest first
    
    console.log(`Queue breakdown: ${inCallUsers.length} in-call users, ${waitingUsers.length} waiting users`);
    
    // First try to match with someone already in a call (priority)
    for (const user of inCallUsers) {
      try {
        // Skip if this is the user we just left
        if (lastMatchedWith && user.username === lastMatchedWith) {
          console.log(`Skipping recent match ${user.username} for user ${username}`);
          continue;
        }
        
        // Skip if cooldown is active using both traditional and new methods
        const traditionalCooldown = user.lastMatch?.matchedWith === username && 
            (Date.now() - user.lastMatch.timestamp < 2 * 1000); // Reduced from 5 to 2 seconds
            
        const canRematchResult = await canRematch(username, user.username, true); // Enable left-behind bypass
        
        if (traditionalCooldown || !canRematchResult) {
          console.log(`Skipping ${user.username} due to active cooldown (${traditionalCooldown ? 'traditional' : 'new system'})`);
          continue;
        }
        
        // We found a match!
        await removeUserFromQueue(user.username);
        
        // For in-call users, use their room if they have one
        let roomName = user.roomName;
        if (!roomName) {
          roomName = await generateUniqueRoomName();
        }
        
        // Create match record
        const matchData: ActiveMatch = {
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
        
        // Record the match in the new cooldown system with skip scenario flag
        const isSkipScenario = user.state === 'in_call'; // In-call users are typically from skip scenarios
        await recordRecentMatch(username, user.username, 2, isSkipScenario);
        
        const result: MatchedResult = {
          status: 'matched',
          roomName: matchData.roomName,
          matchedWith: user.username,
          useDemo: useDemo || user.useDemo
        };
        
        return result;
      } catch (e) {
        console.error('Error processing potential match from in-call queue:', e);
      }
    }
    
    // If no in-call matches, try regular waiting users
    for (const user of waitingUsers) {
      try {
        // Skip if this is the user we just left
        if (lastMatchedWith && user.username === lastMatchedWith) {
          console.log(`Skipping recent match ${user.username} for user ${username}`);
          continue;
        }
        
        // Skip if cooldown is active using both traditional and new methods
        const traditionalCooldown = user.lastMatch?.matchedWith === username && 
            (Date.now() - user.lastMatch.timestamp < 2 * 1000); // Reduced from 5 to 2 seconds
            
        const canRematchResult = await canRematch(username, user.username, false); // No left-behind bypass for waiting users
        
        if (traditionalCooldown || !canRematchResult) {
          console.log(`Skipping ${user.username} due to active cooldown (${traditionalCooldown ? 'traditional' : 'new system'})`);
          continue;
        }
        
        // We found a match!
        await removeUserFromQueue(user.username);
        
        // Generate new room name
        const roomName = await generateUniqueRoomName();
        console.log(`Generated new room ${roomName} for match between ${username} (caller) and ${user.username} (from waiting queue)`);
        
        // Create match record
        const matchData: ActiveMatch = {
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
        
        // Record the match in the new cooldown system
        await recordRecentMatch(username, user.username, 2, false); // Normal scenario, reduced cooldown
        
        const result: MatchedResult = {
          status: 'matched',
          roomName: matchData.roomName,
          matchedWith: user.username,
          useDemo: useDemo || user.useDemo
        };
        
        return result;
      } catch (e) {
        console.error('Error processing potential match from waiting queue:', e);
      }
    }
    
    // No match found, make sure the user is in the queue
    await addUserToQueue(username, useDemo, 'waiting');
    
    const waitingResult: WaitingResult = { status: 'waiting' };
    return waitingResult;
  } catch (error) {
    console.error('Error in findMatchForUser:', error);
    // Always make sure user is in queue even if there's an error
    try {
      await addUserToQueue(username, useDemo, 'waiting');
    } catch (queueError) {
      console.error('Error adding user to queue after match error:', queueError);
    }
    const errorResult: ErrorResult = { status: 'error', error: String(error) };
    return errorResult;
  } finally {
    // Always release the lock if we acquired it
    if (lockAcquired) {
      await releaseMatchLock(lockId);
    }
  }
} 