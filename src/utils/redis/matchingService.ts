import redis from '../../lib/redis';
import { ACTIVE_MATCHES, MATCHING_QUEUE } from './constants';
import { acquireMatchLock, releaseMatchLock } from './lockManager';
import { addUserToQueue, removeUserFromQueue } from './queueManager';
import { generateUniqueRoomName } from './roomManager';
import { UserDataInQueue, ActiveMatch, MatchResult, MatchedResult, WaitingResult, ErrorResult } from './types';
import { canRematch, recordCooldown } from './rematchCooldown';

// Helper function to get user's current queue status
async function getUserQueueStatus(username: string): Promise<{ status: string; roomName?: string } | null> {
  try {
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
    
    for (const userData of allQueuedUsersRaw) {
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        if (user.username === username) {
          return {
            status: user.state,
            roomName: user.roomName
          };
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    
    return { status: 'not_in_queue' };
  } catch (error) {
    console.error(`Error getting queue status for ${username}:`, error);
    return null;
  }
}

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
      const result = await addUserToQueue(username, useDemo, 'waiting');
      if (result.added) {
        return { status: 'waiting' };
      } else {
        return { status: 'error', error: `Failed to add to queue: ${result.reason}` };
      }
    }
    
    // First check if this user is already in a match
    const existingMatch = await checkExistingMatch(username);
    if (existingMatch) {
      console.log(`User ${username} is already matched, returning existing match`);
      return existingMatch;
    }
    
    // Get all users from the unified queue with scores for proper ordering
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1, 'WITHSCORES');
    console.log(`Looking for match for ${username}. Found ${allQueuedUsersRaw.length / 2} users in queue`);
    
    // Parse all users into UserDataInQueue objects with their scores
    const queuedUsersWithScores: { user: UserDataInQueue; score: number }[] = [];
    for (let i = 0; i < allQueuedUsersRaw.length; i += 2) {
      const userData = allQueuedUsersRaw[i];
      const score = parseFloat(allQueuedUsersRaw[i + 1]);
      
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        // Skip ourselves and validate user data
        if (user.username !== username && user.username && typeof user.username === 'string') {
          queuedUsersWithScores.push({ user, score });
        }
      } catch (e) {
        console.error('Error parsing user data from queue:', e);
      }
    }
    
    // Sort all users by score/timestamp (FIFO - no priority based on state)
    const sortedUsers = queuedUsersWithScores
      .sort((a, b) => a.score - b.score)
      .map(item => item.user);
    
    console.log(`Queue breakdown: ${sortedUsers.length} users total (FIFO order)`);
    
    // Try to match with any available user in FIFO order
    for (const user of sortedUsers) {
      try {
        // Skip if this is the user we just left
        if (lastMatchedWith && user.username === lastMatchedWith) {
          console.log(`Skipping recent match ${user.username} for user ${username}`);
          continue;
        }
        
        // Double-check this user isn't already matched
        const userAlreadyMatched = await checkExistingMatch(user.username);
        if (userAlreadyMatched) {
          console.log(`User ${user.username} is already matched, skipping`);
          continue;
        }
        
        // Check cooldown system
        const canRematchResult = await canRematch(username, user.username);
        
        if (!canRematchResult) {
          console.log(`Skipping ${user.username} due to cooldown`);
          continue;
        }
        
        // We found a match! Remove the other user from queue first
        const removed = await removeUserFromQueue(user.username);
        if (!removed) {
          console.log(`Failed to remove ${user.username} from queue, skipping`);
          continue;
        }
        
        // Use existing room if available, otherwise create new
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
        
        // Make sure the matching user is also removed from queue
        await removeUserFromQueue(username);
        
        // Record cooldown for normal match
        await recordCooldown(username, user.username, 'normal');
        
        const result: MatchedResult = {
          status: 'matched',
          roomName: matchData.roomName,
          matchedWith: user.username,
          useDemo: useDemo || user.useDemo
        };
        
        return result;
      } catch (e) {
        console.error('Error processing potential match from queue:', e);
      }
    }
    
    // No match found, make sure the user is in the queue
    const currentStatus = await getUserQueueStatus(username);
    if (!currentStatus || currentStatus.status === 'not_in_queue' || currentStatus.status === 'not_waiting') {
      const addResult = await addUserToQueue(username, useDemo, 'waiting');
      if (addResult.added) {
        console.log(`Added ${username} to queue as no match was found`);
      } else {
        console.log(`Failed to add ${username} to queue: ${addResult.reason}`);
        return { status: 'error', error: `Failed to add to queue: ${addResult.reason}` };
      }
    } else {
      console.log(`User ${username} already in queue with status ${currentStatus.status}, not adding again`);
    }
    
    const waitingResult: WaitingResult = { status: 'waiting' };
    return waitingResult;
  } catch (error) {
    console.error('Error in findMatchForUser:', error);
    // Always make sure user is in queue even if there's an error
    try {
      const addResult = await addUserToQueue(username, useDemo, 'waiting');
      if (!addResult.added && addResult.reason !== 'already_in_queue_same_state') {
        console.error('Error adding user to queue after match error:', addResult.reason);
      }
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