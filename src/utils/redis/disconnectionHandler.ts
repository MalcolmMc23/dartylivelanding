import redis from '../../lib/redis';
import { ACTIVE_MATCHES, LEFT_BEHIND_PREFIX } from './constants';
import { generateUniqueRoomName } from './roomManager';
import { addUserToQueue, removeUserFromQueue } from './queueManager';
import { findMatchForUser } from './matchingService';
import { clearCooldown } from './rematchCooldown';
import { ActiveMatch } from './types';
import { updateUserSkipStats, getUserSkipStats } from './skipStatsManager';

// Handle user disconnection
export async function handleUserDisconnection(username: string, roomName: string, otherUsername?: string) {
  // Get match data
  const matchDataString = await redis.hget(ACTIVE_MATCHES, roomName);
  
  if (!matchDataString) {
    console.log(`No active match found for room ${roomName}`);
    return { status: 'no_match_found' };
  }
  
  try {
    const match = JSON.parse(matchDataString as string) as ActiveMatch;
    
    // Determine who was left behind
    let leftBehindUser = otherUsername;
    if (!leftBehindUser) {
      leftBehindUser = match.user1 === username ? match.user2 : match.user1;
    }
    
    console.log(`User ${username} disconnected from ${roomName}. Left-behind user: ${leftBehindUser}`);
    
    // Calculate call duration
    const callEndTime = Date.now();
    const callDurationMs = callEndTime - match.matchedAt;

    // Get current skip stats for both users before updating
    const [disconnectingUserStats, leftBehindUserStats] = await Promise.all([
      getUserSkipStats(username),
      getUserSkipStats(leftBehindUser)
    ]);

    // Log current skip ratings
    console.log('=== Skip Ratings Before Update ===');
    console.log(`User ${username}:`, {
      averageSkipTime: disconnectingUserStats?.averageSkipTime || 0,
      totalSkips: disconnectingUserStats?.totalSkipsInvolved || 0,
      totalInteractionTime: disconnectingUserStats?.totalInteractionTimeWithSkips || 0
    });
    console.log(`User ${leftBehindUser}:`, {
      averageSkipTime: leftBehindUserStats?.averageSkipTime || 0,
      totalSkips: leftBehindUserStats?.totalSkipsInvolved || 0,
      totalInteractionTime: leftBehindUserStats?.totalInteractionTimeWithSkips || 0
    });

    // Update skip stats for both users involved if duration is valid
    if (callDurationMs >= 0) {
      if (username) {
        await updateUserSkipStats(username, callDurationMs);
      }
      if (leftBehindUser) {
        await updateUserSkipStats(leftBehindUser, callDurationMs);
      }

      // Get updated stats after the update
      const [updatedDisconnectingUserStats, updatedLeftBehindUserStats] = await Promise.all([
        getUserSkipStats(username),
        getUserSkipStats(leftBehindUser)
      ]);

      // Log updated skip ratings
      console.log('=== Skip Ratings After Update ===');
      console.log(`User ${username}:`, {
        averageSkipTime: updatedDisconnectingUserStats?.averageSkipTime || 0,
        totalSkips: updatedDisconnectingUserStats?.totalSkipsInvolved || 0,
        totalInteractionTime: updatedDisconnectingUserStats?.totalInteractionTimeWithSkips || 0
      });
      console.log(`User ${leftBehindUser}:`, {
        averageSkipTime: updatedLeftBehindUserStats?.averageSkipTime || 0,
        totalSkips: updatedLeftBehindUserStats?.totalSkipsInvolved || 0,
        totalInteractionTime: updatedLeftBehindUserStats?.totalInteractionTimeWithSkips || 0
      });
    } else {
      console.warn(`Negative or invalid call duration (${callDurationMs}ms) for room ${roomName}. Stats not updated.`);
    }
    
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