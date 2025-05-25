import redis from '../../lib/redis';
import { ACTIVE_MATCHES } from './constants';
import { ActiveMatch } from './types';
import { addUserToQueue, removeUserFromQueue } from './queueManager';
import { updateRoomOccupancy, removeUserFromRoom } from './roomStateManager';

const ROOM_OCCUPANCY_KEY = 'room_occupancy';
const ALONE_USER_TRACKING = 'alone_user_tracking';
const ALONE_TIMEOUT_MS = 5000; // 5 seconds

export interface AloneUserState {
  username: string;
  roomName: string;
  aloneStartTime: number;
  useDemo: boolean;
  lastChecked: number;
}

/**
 * Track when a user becomes alone in a room
 */
export async function trackUserAlone(username: string, roomName: string, useDemo: boolean): Promise<void> {
  const now = Date.now();
  
  const aloneState: AloneUserState = {
    username,
    roomName,
    aloneStartTime: now,
    useDemo,
    lastChecked: now
  };
  
  await redis.hset(ALONE_USER_TRACKING, username, JSON.stringify(aloneState));
  console.log(`Started tracking user ${username} alone in room ${roomName}`);
}

/**
 * Stop tracking a user (when they get matched or leave)
 */
export async function stopTrackingUserAlone(username: string): Promise<void> {
  await redis.hdel(ALONE_USER_TRACKING, username);
  console.log(`Stopped tracking user ${username} as alone`);
}

/**
 * Check all users who are alone and reset those who have been alone for more than 5 seconds
 */
export async function processAloneUsers(): Promise<{
  usersReset: number;
  usersStillAlone: number;
  errors: string[];
}> {
  const result = {
    usersReset: 0,
    usersStillAlone: 0,
    errors: [] as string[]
  };

  try {
    const now = Date.now();
    const allAloneUsers = await redis.hgetall(ALONE_USER_TRACKING);
    
    for (const [username, aloneDataStr] of Object.entries(allAloneUsers)) {
      try {
        const aloneData = JSON.parse(aloneDataStr) as AloneUserState;
        const timeAlone = now - aloneData.aloneStartTime;
        
        // Check if user has been alone for more than 5 seconds
        if (timeAlone >= ALONE_TIMEOUT_MS) {
          console.log(`User ${username} has been alone in room ${aloneData.roomName} for ${timeAlone}ms, resetting...`);
          
          // Verify the user is actually still alone by checking room occupancy
          const isStillAlone = await verifyUserStillAlone(username, aloneData.roomName);
          
          if (isStillAlone) {
            await resetAloneUser(username, aloneData);
            result.usersReset++;
          } else {
            // User is no longer alone, stop tracking
            await stopTrackingUserAlone(username);
            console.log(`User ${username} is no longer alone, stopped tracking`);
          }
        } else {
          result.usersStillAlone++;
          // Update last checked time
          aloneData.lastChecked = now;
          await redis.hset(ALONE_USER_TRACKING, username, JSON.stringify(aloneData));
        }
      } catch (error) {
        const errorMsg = `Error processing alone user ${username}: ${error}`;
        result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
    
    // Clean up stale tracking entries (older than 1 minute)
    await cleanupStaleTrackingEntries();
    
  } catch (error) {
    const errorMsg = `Error in processAloneUsers: ${error}`;
    result.errors.push(errorMsg);
    console.error(errorMsg);
  }

  return result;
}

/**
 * Verify that a user is actually still alone in their room
 */
async function verifyUserStillAlone(username: string, roomName: string): Promise<boolean> {
  try {
    const occupancyData = await redis.hget(ROOM_OCCUPANCY_KEY, roomName);
    
    if (!occupancyData) {
      // Room doesn't exist, user is not in any room
      return false;
    }
    
    const occupancy = JSON.parse(occupancyData);
    
    // Check if user is in the room and is the only participant
    return occupancy.participants.includes(username) && occupancy.participants.length === 1;
  } catch (error) {
    console.error(`Error verifying user alone status for ${username}:`, error);
    return false;
  }
}

/**
 * Reset a user who has been alone for too long
 */
async function resetAloneUser(username: string, aloneData: AloneUserState): Promise<void> {
  try {
    console.log(`Resetting user ${username} who was alone in room ${aloneData.roomName}`);
    
    // 1. Remove user from room tracking
    await removeUserFromRoom(username, aloneData.roomName);
    
    // 2. Clean up the active match if it exists
    const matchData = await redis.hget(ACTIVE_MATCHES, aloneData.roomName);
    if (matchData) {
      try {
        const match = JSON.parse(matchData) as ActiveMatch;
        // Only remove the match if this user is part of it
        if (match.user1 === username || match.user2 === username) {
          await redis.hdel(ACTIVE_MATCHES, aloneData.roomName);
          console.log(`Removed active match for room ${aloneData.roomName}`);
        }
      } catch (e) {
        console.error('Error parsing match data during reset:', e);
      }
    }
    
    // 3. Remove user from any existing queue entries
    await removeUserFromQueue(username);
    
    // 4. Add user back to queue with fresh state
    await addUserToQueue(
      username,
      aloneData.useDemo,
      'waiting', // Reset to normal waiting state
      undefined, // No room name - let them get a fresh room
      undefined  // Clear any last match data
    );
    
    // 5. Stop tracking this user as alone
    await stopTrackingUserAlone(username);
    
    // 6. Update room occupancy to reflect user leaving
    await updateRoomOccupancy(aloneData.roomName, []);
    
    console.log(`Successfully reset user ${username} back to queue`);
    
  } catch (error) {
    console.error(`Error resetting alone user ${username}:`, error);
    throw error;
  }
}

/**
 * Clean up stale tracking entries
 */
async function cleanupStaleTrackingEntries(): Promise<void> {
  try {
    const now = Date.now();
    const oneMinuteAgo = now - 60000; // 1 minute
    
    const allAloneUsers = await redis.hgetall(ALONE_USER_TRACKING);
    
    for (const [username, aloneDataStr] of Object.entries(allAloneUsers)) {
      try {
        const aloneData = JSON.parse(aloneDataStr) as AloneUserState;
        
        // Remove entries that are older than 1 minute
        if (aloneData.lastChecked < oneMinuteAgo) {
          await redis.hdel(ALONE_USER_TRACKING, username);
          console.log(`Cleaned up stale alone tracking for user ${username}`);
        }
      } catch {
        // Remove corrupted entries
        await redis.hdel(ALONE_USER_TRACKING, username);
        console.log(`Removed corrupted alone tracking entry for user ${username}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up stale tracking entries:', error);
  }
}

/**
 * Start the background processor for alone users
 */
let aloneUserProcessor: NodeJS.Timeout | null = null;

export function startAloneUserProcessor(): void {
  if (aloneUserProcessor) {
    console.log('Alone user processor already running');
    return;
  }
  
  console.log('Starting alone user processor');
  
  aloneUserProcessor = setInterval(async () => {
    try {
      const result = await processAloneUsers();
      
      // Log activity for debugging
      if (result.usersReset > 0 || result.usersStillAlone > 0 || result.errors.length > 0) {
        console.log(`[AloneUserProcessor] Reset: ${result.usersReset}, Still alone: ${result.usersStillAlone}, Errors: ${result.errors.length}`);
      }
      
      if (result.errors.length > 0) {
        console.error('Alone user processor errors:', result.errors);
      }
    } catch (error) {
      console.error('Error in alone user processor:', error);
    }
  }, 2000); // Check every 2 seconds for responsiveness
}

export function stopAloneUserProcessor(): void {
  if (aloneUserProcessor) {
    clearInterval(aloneUserProcessor);
    aloneUserProcessor = null;
    console.log('Stopped alone user processor');
  }
}

// Auto-start the processor in server environments
if (typeof window === 'undefined') {
  setTimeout(() => {
    startAloneUserProcessor();
  }, 2000); // Start after a short delay
} 