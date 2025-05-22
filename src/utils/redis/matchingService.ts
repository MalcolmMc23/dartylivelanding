import redis from '../../lib/redis';
import { ACTIVE_MATCHES, IN_CALL_QUEUE, WAITING_QUEUE } from './constants';
import { acquireMatchLock, releaseMatchLock } from './lockManager';
import { addUserToQueue, removeUserFromQueue } from './queueManager';
import { generateUniqueRoomName } from './roomManager';

// Helper function to check if user is already in a match
export async function checkExistingMatch(username: string) {
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
            (Date.now() - user.lastMatch.timestamp < 5 * 1000)) {
          console.log(`Skipping ${user.username} due to recent match cooldown`);
          continue;
        }
        
        // We found a match!
        await removeUserFromQueue(user.username); // Remove targetUser from queue
        
        // For in-call users
        let roomName = user.roomName; // This is roomName of the person found in IN_CALL_QUEUE
        if (!roomName) {
          roomName = await generateUniqueRoomName();
        }
        
        // Create match record
        const matchData = {
          user1: username,
          user2: user.username,
          roomName, // Use the newly generated roomName
          useDemo: useDemo || user.useDemo,
          matchedAt: Date.now()
        };
        
        await redis.hset(ACTIVE_MATCHES, matchData.roomName, JSON.stringify(matchData));
        console.log(`Created match: ${username} with ${user.username} in room ${roomName}`);
        
        // Make sure both users are removed from all queues
        await removeUserFromQueue(username); // Remove caller from all queues as well
        
        return {
          status: 'matched',
          roomName: matchData.roomName,
          matchedWith: user.username,
          useDemo: useDemo || user.useDemo
        };
      } catch (e) {
        console.error('Error processing user data from in-call queue:', e);
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
            (Date.now() - user.lastMatch.timestamp < 5 * 1000)) continue;
        
        // We found a match!
        await removeUserFromQueue(user.username);
        
        // Generate new room name
        const roomName = await generateUniqueRoomName();
        console.log(`Generated new room ${roomName} for match between ${username} (caller) and ${user.username} (from waiting queue)`);
        
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
        console.error('Error processing user data from waiting queue:', e);
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