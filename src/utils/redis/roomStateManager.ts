import redis from '../../lib/redis';
import { ACTIVE_MATCHES, MATCHING_QUEUE } from './constants';
import { UserDataInQueue, ActiveMatch } from './types';
import { addUserToQueue, removeUserFromQueue } from './queueManager';
import { trackUserAlone, stopTrackingUserAlone } from './aloneUserManager';
import { checkPendingLeftBehindState } from './leftBehindUserHandler';
import { validateMatch } from './matchValidator';

const ROOM_OCCUPANCY_KEY = 'room_occupancy';
const USER_ROOM_MAPPING = 'user_room_mapping';

export interface RoomOccupancy {
  roomName: string;
  participants: string[];
  lastUpdated: number;
  isActive: boolean;
}

export interface UserRoomState {
  username: string;
  roomName: string;
  isAlone: boolean;
  lastUpdated: number;
  shouldBeInQueue: boolean;
}

/**
 * Update room occupancy from LiveKit webhook or client-side events
 */
export async function updateRoomOccupancy(
  roomName: string, 
  participants: string[]
): Promise<void> {
  const now = Date.now();
  
  const occupancy: RoomOccupancy = {
    roomName,
    participants: participants.filter(p => p && p.trim() !== ''),
    lastUpdated: now,
    isActive: participants.length > 0
  };
  
  // Store room occupancy
  await redis.hset(ROOM_OCCUPANCY_KEY, roomName, JSON.stringify(occupancy));
  
  // Update user-room mappings
  for (const participant of occupancy.participants) {
    const userState: UserRoomState = {
      username: participant,
      roomName,
      isAlone: occupancy.participants.length === 1,
      lastUpdated: now,
      shouldBeInQueue: occupancy.participants.length === 1
    };
    
    await redis.hset(USER_ROOM_MAPPING, participant, JSON.stringify(userState));
  }
  
  // Handle users who are alone in rooms
  if (occupancy.participants.length === 1) {
    const aloneUser = occupancy.participants[0];
    console.log(`User ${aloneUser} is alone in room ${roomName}, starting alone tracking`);
    
    // Check if there's an active match for this room and validate it
    const matchData = await redis.hget(ACTIVE_MATCHES, roomName);
    let useDemo = false;
    
    if (matchData) {
      try {
        const match = JSON.parse(matchData) as ActiveMatch;
        useDemo = match.useDemo || false;
        
        // Validate the match - if only one user is in the room, the match is invalid
        const isValidMatch = await validateMatch(roomName);
        if (!isValidMatch) {
          console.log(`Match ${roomName} is invalid (only one user in room), cleaning up and requeuing ${aloneUser}`);
          
          // Remove the invalid match
          await redis.hdel(ACTIVE_MATCHES, roomName);
          
          // Add the alone user back to queue with 'in_call' state
          await addUserToQueue(aloneUser, useDemo, 'in_call', roomName);
          
          console.log(`Cleaned up invalid match and requeued ${aloneUser} in room ${roomName}`);
          return; // Exit early since we've handled this case
        }
      } catch (e) {
        console.error('Error parsing match data:', e);
      }
    }
    
    // Start tracking this user as alone (will be reset after 5 seconds if still alone)
    await trackUserAlone(aloneUser, roomName, useDemo);
    
    // Also ensure the alone user is in the queue with 'in_call' state for immediate matching
    await ensureUserInQueue(aloneUser, roomName);
  } else if (occupancy.participants.length > 1) {
    // If there are multiple participants, stop tracking any of them as alone
    for (const participant of occupancy.participants) {
      await stopTrackingUserAlone(participant);
    }
  }
  
  // Clean up empty rooms
  if (occupancy.participants.length === 0) {
    await cleanupEmptyRoom(roomName);
  }
  
  console.log(`Updated room occupancy for ${roomName}: ${occupancy.participants.length} participants`);
}

/**
 * Ensure a user who is alone in a room is properly queued for matching
 */
async function ensureUserInQueue(username: string, roomName: string): Promise<void> {
  try {
    // First check if user has a pending left-behind state being processed
    const pendingState = await checkPendingLeftBehindState(username);
    if (pendingState.hasPendingState) {
      console.log(`User ${username} has pending left-behind state, skipping queue operation`);
      return;
    }
    
    // Check if user is already in queue
    const queueStatus = await getUserQueueStatus(username);
    
    if (!queueStatus || queueStatus.status === 'not_in_queue') {
      console.log(`User ${username} is alone in room ${roomName} but not in queue, adding them`);
      
      // Get user's demo preference from active match if available
      let useDemo = false;
      const matchData = await redis.hget(ACTIVE_MATCHES, roomName);
      if (matchData) {
        try {
          const match = JSON.parse(matchData) as ActiveMatch;
          useDemo = match.useDemo || false;
        } catch (e) {
          console.error('Error parsing match data:', e);
        }
      }
      
      // Add user to queue with 'in_call' state (high priority)
      const result = await addUserToQueue(username, useDemo, 'in_call', roomName);
      if (result.added) {
        console.log(`Successfully added ${username} to queue with 'in_call' state`);
      } else {
        console.log(`Failed to add ${username} to queue: ${result.reason}`);
      }
    } else if (queueStatus.status === 'waiting' && queueStatus.roomName !== roomName) {
      // User is in queue but with wrong state or room, update to 'in_call'
      console.log(`User ${username} is in queue as 'waiting' but should be 'in_call' in room ${roomName}, updating`);
      
      // Remove and re-add with correct state
      await removeUserFromQueue(username);
      
      let useDemo = false;
      const matchData = await redis.hget(ACTIVE_MATCHES, roomName);
      if (matchData) {
        try {
          const match = JSON.parse(matchData) as ActiveMatch;
          useDemo = match.useDemo || false;
        } catch (e) {
          console.error('Error parsing match data:', e);
        }
      }
      
      const result = await addUserToQueue(username, useDemo, 'in_call', roomName);
      if (result.added) {
        console.log(`Successfully updated ${username} to 'in_call' state in room ${roomName}`);
      } else {
        console.log(`Failed to update ${username} queue state: ${result.reason}`);
      }
    } else if (queueStatus.status === 'in_call' && queueStatus.roomName === roomName) {
      console.log(`User ${username} is already properly queued for room ${roomName}`);
    }
  } catch (error) {
    console.error(`Error ensuring user ${username} is in queue:`, error);
  }
}

// Helper to check if user is in an active match
// async function checkUserInActiveMatch(username: string): Promise<{ roomName: string; matchedWith: string } | null> {
//   const allMatches = await redis.hgetall(ACTIVE_MATCHES);
//   
//   for (const [roomName, matchData] of Object.entries(allMatches)) {
//     try {
//       const match = JSON.parse(matchData as string);
//       if (match.user1 === username || match.user2 === username) {
//         return {
//           roomName,
//           matchedWith: match.user1 === username ? match.user2 : match.user1
//         };
//       }
//     } catch (e) {
//       console.error('Error parsing match data:', e);
//     }
//   }
//   
//   return null;
// }

/**
 * Get user's current queue status
 */
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

/**
 * Clean up empty room data
 */
async function cleanupEmptyRoom(roomName: string): Promise<void> {
  try {
    console.log(`Cleaning up empty room: ${roomName}`);
    
    // Check if there's an active match for this room before cleaning up
    const matchData = await redis.hget(ACTIVE_MATCHES, roomName);
    if (matchData) {
      try {
        const match = JSON.parse(matchData) as ActiveMatch;
        const matchAge = Date.now() - match.matchedAt;
        
        // If the match is less than 2 minutes old, don't clean up yet
        if (matchAge < 120000) {
          console.log(`Room ${roomName} has recent active match (${matchAge}ms old), not cleaning up yet`);
          return;
        }
      } catch (e) {
        console.error('Error parsing match data during cleanup:', e);
      }
    }
    
    // Remove from all tracking systems
    await redis.hdel(ROOM_OCCUPANCY_KEY, roomName);
    await redis.hdel(USER_ROOM_MAPPING, roomName);
    await redis.hdel(ACTIVE_MATCHES, roomName);
    
    console.log(`Successfully cleaned up room: ${roomName}`);
  } catch (error) {
    console.error(`Error cleaning up room ${roomName}:`, error);
  }
}

/**
 * Get all users who are alone in rooms and should be in queue
 */
export async function getUsersAloneInRooms(): Promise<string[]> {
  const aloneUsers: string[] = [];
  
  try {
    const allOccupancy = await redis.hgetall(ROOM_OCCUPANCY_KEY);
    
    for (const [roomName, occupancyData] of Object.entries(allOccupancy)) {
      try {
        const occupancy = JSON.parse(occupancyData) as RoomOccupancy;
        
        // Check if room has exactly one participant and is recent
        if (occupancy.participants.length === 1 && 
            (Date.now() - occupancy.lastUpdated) < 300000) { // 5 minutes
          console.log(`Found user alone in room ${roomName}: ${occupancy.participants[0]}`);
          aloneUsers.push(occupancy.participants[0]);
        }
      } catch (e) {
        console.error(`Error parsing occupancy data for room ${roomName}:`, e);
      }
    }
  } catch (error) {
    console.error('Error getting users alone in rooms:', error);
  }
  
  return aloneUsers;
}

/**
 * Sync room states with queue states - ensure consistency
 */
export async function syncRoomAndQueueStates(): Promise<{
  usersAddedToQueue: number;
  usersRemovedFromQueue: number;
  roomsCleaned: number;
}> {
  const result = {
    usersAddedToQueue: 0,
    usersRemovedFromQueue: 0,
    roomsCleaned: 0
  };
  
  try {
    console.log('Starting room and queue state synchronization');
    
    // 1. Get all users alone in rooms
    const usersAloneInRooms = await getUsersAloneInRooms();
    
    // 2. Ensure all alone users are in queue
    for (const username of usersAloneInRooms) {
      const userMapping = await redis.hget(USER_ROOM_MAPPING, username);
      if (userMapping) {
        try {
          const userState = JSON.parse(userMapping) as UserRoomState;
          if (userState.shouldBeInQueue) {
            await ensureUserInQueue(username, userState.roomName);
            result.usersAddedToQueue++;
          }
        } catch (e) {
          console.error('Error processing user mapping:', e);
        }
      }
    }
    
    // 3. Check for users in queue who are not actually in rooms
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
    
    for (const userData of allQueuedUsersRaw) {
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        
        if (user.state === 'in_call' && user.roomName) {
          // Check if this user is actually in the room they claim to be in
          const occupancyData = await redis.hget(ROOM_OCCUPANCY_KEY, user.roomName);
          
          if (occupancyData) {
            const occupancy = JSON.parse(occupancyData) as RoomOccupancy;
            
            if (!occupancy.participants.includes(user.username)) {
              console.log(`User ${user.username} claims to be in room ${user.roomName} but is not there, removing from queue`);
              await removeUserFromQueue(user.username);
              result.usersRemovedFromQueue++;
            }
          } else {
            // Room doesn't exist, user shouldn't be in 'in_call' state
            console.log(`User ${user.username} is in 'in_call' state for non-existent room ${user.roomName}, converting to waiting`);
            await removeUserFromQueue(user.username);
            await addUserToQueue(user.username, user.useDemo, 'waiting');
            result.usersRemovedFromQueue++;
          }
        }
      } catch (e) {
        console.error('Error processing queued user during sync:', e);
      }
    }
    
    // 4. Clean up stale room data
    const allOccupancy = await redis.hgetall(ROOM_OCCUPANCY_KEY);
    const fiveMinutesAgo = Date.now() - 300000;
    
    for (const [roomName, occupancyData] of Object.entries(allOccupancy)) {
      try {
        const occupancy = JSON.parse(occupancyData) as RoomOccupancy;
        
        if (occupancy.lastUpdated < fiveMinutesAgo && occupancy.participants.length === 0) {
          await cleanupEmptyRoom(roomName);
          result.roomsCleaned++;
        }
      } catch (e) {
        console.error('Error processing room during cleanup:', e);
      }
    }
    
    console.log('Room and queue state synchronization completed:', result);
    
  } catch (error) {
    console.error('Error during room and queue state sync:', error);
  }
  
  return result;
}

/**
 * Remove user from room tracking when they leave
 */
export async function removeUserFromRoom(username: string, roomName: string): Promise<void> {
  try {
    // Get current occupancy
    const occupancyData = await redis.hget(ROOM_OCCUPANCY_KEY, roomName);
    
    if (occupancyData) {
      const occupancy = JSON.parse(occupancyData) as RoomOccupancy;
      
      // Remove user from participants
      occupancy.participants = occupancy.participants.filter(p => p !== username);
      occupancy.lastUpdated = Date.now();
      
      // Update occupancy
      if (occupancy.participants.length > 0) {
        await redis.hset(ROOM_OCCUPANCY_KEY, roomName, JSON.stringify(occupancy));
        
        // If there's now only one user left, ensure they're in queue
        if (occupancy.participants.length === 1) {
          await ensureUserInQueue(occupancy.participants[0], roomName);
        }
      } else {
        // Room is empty, clean it up
        await cleanupEmptyRoom(roomName);
      }
    }
    
    // Remove user from user-room mapping
    await redis.hdel(USER_ROOM_MAPPING, username);
    
    // Stop tracking this user as alone since they're leaving
    await stopTrackingUserAlone(username);
    
    console.log(`Removed user ${username} from room ${roomName}`);
    
  } catch (error) {
    console.error(`Error removing user ${username} from room ${roomName}:`, error);
  }
}