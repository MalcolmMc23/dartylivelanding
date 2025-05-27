import redis from '../../lib/redis';
import { LEFT_BEHIND_PREFIX } from './constants';
import { addUserToQueue, removeUserFromQueue } from './queueManager';
import { generateUniqueRoomName } from './roomManager';
import { findMatchForUser } from './matchingService';
import { recordCooldown } from './rematchCooldown';
import { stopTrackingUserAlone } from './aloneUserManager';
import { removeUserFromRoom } from './roomStateManager';

const LEFT_BEHIND_LOCK_PREFIX = 'left_behind_lock:';
const LEFT_BEHIND_PROCESSING_PREFIX = 'left_behind_processing:';
const LOCK_EXPIRY = 10; // 10 seconds
const PROCESSING_EXPIRY = 30; // 30 seconds

export interface LeftBehindResult {
  status: 'immediate_match' | 'queued' | 'already_processing' | 'error';
  newRoomName?: string;
  immediateMatch?: {
    status: string;
    roomName?: string;
    matchedWith?: string;
  };
  message?: string;
}

/**
 * Centralized handler for left-behind users with proper locking and idempotency
 */
export async function handleLeftBehindUserCentralized(
  leftBehindUser: string,
  previousRoomName: string,
  disconnectedUser: string,
  useDemo: boolean
): Promise<LeftBehindResult> {
  const lockKey = `${LEFT_BEHIND_LOCK_PREFIX}${leftBehindUser}`;
  const processingKey = `${LEFT_BEHIND_PROCESSING_PREFIX}${leftBehindUser}`;
  const lockId = `${Date.now()}-${Math.random()}`;
  
  try {
    // 1. Check if this user is already being processed
    const existingProcessing = await redis.get(processingKey);
    if (existingProcessing) {
      console.log(`User ${leftBehindUser} is already being processed for left-behind state`);
      return {
        status: 'already_processing',
        message: 'User is already being processed'
      };
    }
    
    // 2. Try to acquire an exclusive lock for this user
    const lockAcquired = await redis.set(lockKey, lockId, 'EX', LOCK_EXPIRY, 'NX');
    if (lockAcquired !== 'OK') {
      console.log(`Could not acquire lock for left-behind user ${leftBehindUser}`);
      return {
        status: 'already_processing',
        message: 'Another process is handling this user'
      };
    }
    
    // 3. Mark this user as being processed
    await redis.set(processingKey, JSON.stringify({
      startTime: Date.now(),
      previousRoom: previousRoomName,
      disconnectedFrom: disconnectedUser
    }), 'EX', PROCESSING_EXPIRY);
    
    console.log(`Processing left-behind user ${leftBehindUser} after ${disconnectedUser} disconnected`);
    
    // 4. Clean up any existing state for this user
    await cleanupUserState(leftBehindUser, previousRoomName);
    
    // 5. Set a cooldown to prevent immediate re-matching with the same user
    await recordCooldown(leftBehindUser, disconnectedUser, 'normal');
    
    // 6. Generate a new room name for potential matches
    const newRoomName = await generateUniqueRoomName();
    
    // 7. Store left-behind state with idempotency key
    const leftBehindState = {
      username: leftBehindUser,
      previousRoom: previousRoomName,
      disconnectedFrom: disconnectedUser,
      newRoomName: newRoomName,
      timestamp: Date.now(),
      processed: false,
      processingId: lockId
    };
    
    await redis.set(
      `${LEFT_BEHIND_PREFIX}${leftBehindUser}`,
      JSON.stringify(leftBehindState),
      'EX',
      120 // 2 minute expiry
    );
    
    // 8. Try to find an immediate match
    try {
      const matchResult = await findMatchForUser(
        leftBehindUser,
        useDemo,
        disconnectedUser
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
    
    // 9. If no immediate match, add to queue with high priority
    try {
      console.log(`No immediate match found for ${leftBehindUser}, adding to high-priority queue`);
      
      // Ensure user is not already in queue before adding
      await removeUserFromQueue(leftBehindUser);
      
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
      return { 
        status: 'error',
        message: `Failed to add user to queue: ${error}`
      };
    }
    
  } catch (error) {
    console.error(`Error handling left-behind user ${leftBehindUser}:`, error);
    return {
      status: 'error',
      message: `Error processing left-behind user: ${error}`
    };
  } finally {
    // Always clean up the lock and processing marker
    const currentLock = await redis.get(lockKey);
    if (currentLock === lockId) {
      await redis.del(lockKey);
    }
    await redis.del(processingKey);
  }
}

/**
 * Clean up all state for a user before processing them as left-behind
 */
async function cleanupUserState(username: string, roomName: string): Promise<void> {
  try {
    // 1. Remove from any existing queues
    await removeUserFromQueue(username);
    
    // 2. Stop tracking as alone user
    await stopTrackingUserAlone(username);
    
    // 3. Remove from room tracking
    await removeUserFromRoom(username, roomName);
    
    // 4. Clean up any existing left-behind states
    await redis.del(`${LEFT_BEHIND_PREFIX}${username}`);
    
    console.log(`Cleaned up all state for user ${username}`);
  } catch (error) {
    console.error(`Error cleaning up state for user ${username}:`, error);
  }
}

/**
 * Check if a user has a pending left-behind state that needs processing
 */
export async function checkPendingLeftBehindState(username: string): Promise<{
  hasPendingState: boolean;
  state?: {
    username: string;
    previousRoom: string;
    disconnectedFrom: string;
    newRoomName: string;
    timestamp: number;
    processed: boolean;
    processingId: string;
    [key: string]: unknown;
  };
}> {
  try {
    const leftBehindData = await redis.get(`${LEFT_BEHIND_PREFIX}${username}`);
    if (leftBehindData) {
      const state = JSON.parse(leftBehindData);
      return {
        hasPendingState: !state.processed,
        state
      };
    }
    return { hasPendingState: false };
  } catch (error) {
    console.error(`Error checking pending left-behind state for ${username}:`, error);
    return { hasPendingState: false };
  }
}

/**
 * Clean up expired left-behind states
 */
export async function cleanupExpiredLeftBehindStates(): Promise<number> {
  let cleaned = 0;
  try {
    const pattern = `${LEFT_BEHIND_PREFIX}*`;
    const keys = await redis.keys(pattern);
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        try {
          const state = JSON.parse(data);
          // Clean up states older than 5 minutes
          if (Date.now() - state.timestamp > 300000) {
            await redis.del(key);
            cleaned++;
          }
        } catch {
          // Clean up corrupted data
          await redis.del(key);
          cleaned++;
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired left-behind states`);
    }
  } catch (error) {
    console.error('Error cleaning up expired left-behind states:', error);
  }
  
  return cleaned;
} 