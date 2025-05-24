import redis from '../../lib/redis';
import { ACTIVE_MATCHES, LEFT_BEHIND_PREFIX } from './constants';
import { generateUniqueRoomName } from './roomManager';
import { addUserToQueue, removeUserFromQueue } from './queueManager';
import { findMatchForUser } from './matchingService';
import { clearCooldown } from './rematchCooldown';

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
      // Handle the left-behind user with simplified logic
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

// Simplified left-behind user handling
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
  
  // 1. Clear any cooldown between these users to allow immediate rematch
  await clearCooldown(leftBehindUser, disconnectedUser);
  
  // 2. Remove user from any existing queue to start fresh
  await removeUserFromQueue(leftBehindUser);
  
  // 3. Generate a new room name for potential matches
  const newRoomName = await generateUniqueRoomName();
  
  // 4. Store simplified left-behind state (short expiry, minimal data)
  const leftBehindState = {
    username: leftBehindUser,
    previousRoom: previousRoomName,
    disconnectedFrom: disconnectedUser,
    newRoomName: newRoomName,
    timestamp: Date.now(),
    processed: false
  };
  
  await redis.set(
    `${LEFT_BEHIND_PREFIX}${leftBehindUser}`, 
    JSON.stringify(leftBehindState),
    'EX', 
    120 // 2 minute expiry (reduced from 5 minutes)
  );
  
  // 5. Try to find an immediate match (simplified attempt)
  try {
    const matchResult = await findMatchForUser(
      leftBehindUser,
      useDemo,
      disconnectedUser // Don't match with the user who just left
    );
    
    if (matchResult.status === 'matched' && 
        'roomName' in matchResult && 
        'matchedWith' in matchResult) {
      console.log(`Found immediate match for left-behind user ${leftBehindUser} with ${matchResult.matchedWith}`);
      
      // Update state to record the match
      leftBehindState.processed = true;
      await redis.set(
        `${LEFT_BEHIND_PREFIX}${leftBehindUser}`, 
        JSON.stringify(leftBehindState),
        'EX', 
        60 // 1 minute expiry for processed state
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
  
  // 6. If no immediate match, add to queue with high priority
  try {
    console.log(`No immediate match found for ${leftBehindUser}, adding to high-priority queue in room ${newRoomName}`);
    
    await addUserToQueue(
      leftBehindUser,
      useDemo,
      'in_call', // High priority state
      newRoomName
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

// Simplified rematch confirmation
export async function confirmUserRematch(username: string, matchRoom: string, matchedWith: string) {
  const key = `${LEFT_BEHIND_PREFIX}${username}`;
  try {
    const existingData = await redis.get(key);
    if (existingData) {
      // Simply mark as processed and set short expiry
      const leftBehindState = JSON.parse(existingData);
      leftBehindState.processed = true;
      leftBehindState.matchRoom = matchRoom;
      leftBehindState.matchedWith = matchedWith;
      leftBehindState.timestamp = Date.now();
      
      await redis.set(key, JSON.stringify(leftBehindState), 'EX', 60); // 1 minute expiry
      console.log(`Confirmed rematch for ${username} in ${matchRoom}, updated left_behind state.`);
    } else {
      console.log(`No existing left_behind state found for ${username} upon confirming rematch. This might be okay if key expired or was cleared.`);
    }
  } catch (error) {
    console.error(`Error confirming rematch for ${username}:`, error);
  }
}

// Handle user skip (SKIP button) - both users go back to queue
export async function handleUserSkip(username: string, roomName: string, otherUsername?: string) {
  console.log(`Handling user skip: ${username} leaving room ${roomName}, other user: ${otherUsername}`);
  
  // Get match data
  const matchData = await redis.hget(ACTIVE_MATCHES, roomName);
  
  if (!matchData) {
    console.log(`No active match found for room ${roomName}`);
    return { status: 'no_match_found', remainingUser: otherUsername };
  }
  
  try {
    const match = JSON.parse(matchData as string);
    
    // Determine the other user
    let otherUser = otherUsername;
    if (!otherUser) {
      otherUser = match.user1 === username ? match.user2 : match.user1;
    }
    
    console.log(`User ${username} skipped. Both users will be put back into queue: ${username} and ${otherUser}`);
    
    // Remove the match from active matches since both users are leaving
    await redis.hdel(ACTIVE_MATCHES, roomName);
    
    // Remove both users from any existing queues to start fresh
    await removeUserFromQueue(username);
    if (otherUser) {
      await removeUserFromQueue(otherUser);
    }
    
    // Clear any cooldown between these users to allow them to potentially match again
    if (otherUser) {
      await clearCooldown(username, otherUser);
      await clearCooldown(otherUser, username);
    }
    
    // Add both users back to the queue with normal priority
    await addUserToQueue(
      username,
      match.useDemo,
      'waiting', // Normal priority
      undefined // Let them get new room assignments
    );
    
    if (otherUser) {
      await addUserToQueue(
        otherUser,
        match.useDemo,
        'waiting', // Normal priority  
        undefined // Let them get new room assignments
      );
    }
    
    // Clean up any left-behind states
    await redis.del(`${LEFT_BEHIND_PREFIX}${username}`);
    if (otherUser) {
      await redis.del(`${LEFT_BEHIND_PREFIX}${otherUser}`);
    }
    
    return {
      status: 'both_users_requeued',
      skippingUser: username,
      otherUser: otherUser,
      message: 'Both users have been put back into the queue'
    };
  } catch (e) {
    console.error('Error processing user skip:', e);
    return { status: 'error', error: String(e), remainingUser: otherUsername };
  }
}

// Handle session end (END CALL button) - user who clicked goes to main screen, other user goes to queue
export async function handleSessionEnd(username: string, roomName: string, otherUsername?: string) {
  console.log(`Handling session end: ${username} ending call in room ${roomName}, other user: ${otherUsername}`);
  
  // Get match data
  const matchData = await redis.hget(ACTIVE_MATCHES, roomName);
  
  if (!matchData) {
    console.log(`No active match found for room ${roomName}`);
    return { status: 'no_match_found' };
  }
  
  try {
    const match = JSON.parse(matchData as string);
    
    // Determine the other user
    let otherUser = otherUsername;
    if (!otherUser) {
      otherUser = match.user1 === username ? match.user2 : match.user1;
    }
    
    console.log(`User ${username} ended the call. ${username} goes to main screen, ${otherUser} goes back to queue`);
    
    // Remove the match from active matches
    await redis.hdel(ACTIVE_MATCHES, roomName);
    
    // Remove both users from any existing queues first
    await removeUserFromQueue(username);
    if (otherUser) {
      await removeUserFromQueue(otherUser);
    }
    
    // Clean up left-behind state for the user who ended the call
    await redis.del(`${LEFT_BEHIND_PREFIX}${username}`);
    
    // Clear any cooldowns between these users
    if (otherUser) {
      await clearCooldown(username, otherUser);
      await clearCooldown(otherUser, username);
    }
    
    // Put the OTHER user back into the queue (not the one who ended the call)
    if (otherUser) {
      await addUserToQueue(
        otherUser,
        match.useDemo,
        'waiting', // Normal priority
        undefined // Let them get a new room assignment
      );
      
      console.log(`${otherUser} has been added back to the queue after ${username} ended the call`);
    }
    
    // Note: The user who clicked END (username) is NOT put back in queue
    // They will go to the main screen and can manually choose to find a new match
    
    return {
      status: 'session_ended',
      endedBy: username,
      otherUser: otherUser,
      otherUserRequeued: !!otherUser,
      message: `${username} ended the call and returned to main screen. ${otherUser} was put back in queue.`,
      users: [match.user1, match.user2]
    };
  } catch (e) {
    console.error('Error processing session end:', e);
    return { status: 'error', error: String(e) };
  }
} 