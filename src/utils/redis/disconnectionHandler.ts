import redis from '../../lib/redis';
import { ACTIVE_MATCHES, LEFT_BEHIND_PREFIX } from './constants';
import { generateUniqueRoomName } from './roomManager';
import { addUserToQueue, removeUserFromQueue } from './queueManager';
import { findMatchForUser } from './matchingService';

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
    
    // Check if we already have a left-behind record for this user
    if (leftBehindUser) {
      const leftBehindKey = `${LEFT_BEHIND_PREFIX}${leftBehindUser}`;
      const existingLeftBehindData = await redis.get(leftBehindKey);
      
      // If the user is already marked as left-behind in this room, prevent double processing
      if (existingLeftBehindData) {
        try {
          const leftBehindState = JSON.parse(existingLeftBehindData);
          
          // If this is the same room and the user being disconnected is actually the one who was 
          // previously left behind (might happen if the client fires disconnection events incorrectly)
          if (leftBehindState.previousRoom === roomName && username === leftBehindUser) {
            console.log(`WARNING: User ${username} appears to be the left-behind user that was already processed. Skipping duplicate disconnection.`);
            return {
              status: 'already_processed',
              leftBehindUser,
              users: [match.user1, match.user2]
            };
          }
        } catch (e) {
          console.error('Error parsing left-behind data:', e);
        }
      }
    }
    
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

// Handle left-behind user state and matching
export async function handleLeftBehindUser(
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
    `${LEFT_BEHIND_PREFIX}${leftBehindUser}`, 
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
        `${LEFT_BEHIND_PREFIX}${leftBehindUser}`, 
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
      `${LEFT_BEHIND_PREFIX}${leftBehindUser}`, 
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

// Confirm user rematch
export async function confirmUserRematch(username: string, matchRoom: string, matchedWith: string) {
  const key = `${LEFT_BEHIND_PREFIX}${username}`;
  try {
    const existingData = await redis.get(key);
    if (existingData) {
      const leftBehindState = JSON.parse(existingData);
      leftBehindState.processed = true;
      leftBehindState.matchRoom = matchRoom;
      leftBehindState.matchedWith = matchedWith;
      leftBehindState.timestamp = Date.now();
      // Update the key with the new state, defaulting to 5 min expiry like in handleLeftBehindUser
      await redis.set(key, JSON.stringify(leftBehindState), 'EX', 300);
      console.log(`Confirmed rematch for ${username} in ${matchRoom}, updated left_behind state.`);
    } else {
      // If no existing left_behind key, maybe it expired or was never set for this rematch flow.
      // This is fine, nothing to update at this point. Could be logged if becomes an issue.
      console.log(`No existing left_behind state found for ${username} upon confirming rematch. This might be okay if key expired or was cleared.`);
    }
  } catch (error) {
    console.error(`Error confirming rematch for ${username}:`, error);
  }
} 