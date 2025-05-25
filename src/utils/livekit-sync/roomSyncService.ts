import redis from '@/lib/redis';
import { ACTIVE_MATCHES } from '@/utils/redis/constants';
import { ActiveMatch } from '@/utils/redis/types';
import { addUserToQueue, removeUserFromQueue } from '@/utils/redis/queueManager';
import { RoomServiceClient } from 'livekit-server-sdk';

// Initialize LiveKit Room Service Client
const roomService = new RoomServiceClient(
  process.env.LIVEKIT_API_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || '',
  process.env.LIVEKIT_API_KEY || '',
  process.env.LIVEKIT_API_SECRET || ''
);

interface RoomParticipantInfo {
  roomName: string;
  participants: string[];
  participantCount: number;
}

/**
 * Get actual participant count from LiveKit for a specific room
 */
export async function getLiveKitRoomParticipants(roomName: string): Promise<RoomParticipantInfo | null> {
  try {
    const rooms = await roomService.listRooms([roomName]);
    
    if (rooms.length === 0) {
      console.log(`Room ${roomName} not found in LiveKit`);
      return null;
    }
    
    // Get participants using the room service
    const participants = await roomService.listParticipants(roomName);
    const participantIdentities = participants.map(p => p.identity);
    
    return {
      roomName,
      participants: participantIdentities,
      participantCount: participantIdentities.length
    };
  } catch (error) {
    console.error(`Error getting LiveKit room info for ${roomName}:`, error);
    return null;
  }
}

/**
 * Get all active rooms from LiveKit
 */
export async function getAllLiveKitRooms(): Promise<RoomParticipantInfo[]> {
  try {
    const rooms = await roomService.listRooms();
    
    const roomInfos: RoomParticipantInfo[] = [];
    
    for (const room of rooms) {
      try {
        const participants = await roomService.listParticipants(room.name);
        const participantIdentities = participants.map(p => p.identity);
        
        roomInfos.push({
          roomName: room.name,
          participants: participantIdentities,
          participantCount: participantIdentities.length
        });
      } catch (error) {
        console.error(`Error getting participants for room ${room.name}:`, error);
        // Add room with empty participants if we can't get participant list
        roomInfos.push({
          roomName: room.name,
          participants: [],
          participantCount: 0
        });
      }
    }
    
    return roomInfos;
  } catch (error) {
    console.error('Error getting all LiveKit rooms:', error);
    return [];
  }
}

/**
 * Synchronize a specific room's state between LiveKit and Redis
 */
export async function syncRoomState(roomName: string): Promise<{
  action: 'no_change' | 'created_match' | 'removed_match' | 'updated_match' | 'moved_to_queue';
  details: string;
}> {
  try {
    // Get LiveKit room state
    const liveKitRoom = await getLiveKitRoomParticipants(roomName);
    
    // Get Redis match state
    const redisMatchData = await redis.hget(ACTIVE_MATCHES, roomName);
    let redisMatch: ActiveMatch | null = null;
    
    if (redisMatchData) {
      try {
        redisMatch = JSON.parse(redisMatchData);
      } catch (e) {
        console.error(`Error parsing Redis match data for room ${roomName}:`, e);
        // Remove corrupted data
        await redis.hdel(ACTIVE_MATCHES, roomName);
      }
    }
    
    // Case 1: Room doesn't exist in LiveKit
    if (!liveKitRoom || liveKitRoom.participantCount === 0) {
      if (redisMatch) {
        console.log(`Room ${roomName} is empty in LiveKit but has Redis match, removing match`);
        await redis.hdel(ACTIVE_MATCHES, roomName);
        
        // Remove both users from any queues since the room is empty
        await removeUserFromQueue(redisMatch.user1);
        await removeUserFromQueue(redisMatch.user2);
        
        return {
          action: 'removed_match',
          details: `Removed match for empty room ${roomName}`
        };
      }
      return {
        action: 'no_change',
        details: `Room ${roomName} is empty in both LiveKit and Redis`
      };
    }
    
    // Case 2: Room has 1 participant in LiveKit
    if (liveKitRoom.participantCount === 1) {
      const participant = liveKitRoom.participants[0];
      
      if (redisMatch) {
        console.log(`Room ${roomName} has 1 participant but Redis shows match, updating state`);
        
        // Determine which user is still in the room and which left
        const remainingUser = redisMatch.user1 === participant ? redisMatch.user1 : 
                             redisMatch.user2 === participant ? redisMatch.user2 : participant;
        const leftUser = redisMatch.user1 === remainingUser ? redisMatch.user2 : redisMatch.user1;
        
        // Remove the match since it's no longer valid
        await redis.hdel(ACTIVE_MATCHES, roomName);
        
        // Add the remaining user to the in-call queue to find a new match
        await addUserToQueue(remainingUser, redisMatch.useDemo, 'in_call', roomName);
        
        // Remove the user who left from any queues
        await removeUserFromQueue(leftUser);
        
        return {
          action: 'moved_to_queue',
          details: `Moved ${remainingUser} to in-call queue, removed ${leftUser} from queues`
        };
      } else {
        // Single user in room but no Redis match - add them to in-call queue
        console.log(`Room ${roomName} has 1 participant but no Redis match, adding to queue`);
        await addUserToQueue(participant, false, 'in_call', roomName);
        
        return {
          action: 'moved_to_queue',
          details: `Added ${participant} to in-call queue for room ${roomName}`
        };
      }
    }
    
    // Case 3: Room has 2 participants in LiveKit
    if (liveKitRoom.participantCount === 2) {
      const [user1, user2] = liveKitRoom.participants;
      
      if (!redisMatch) {
        console.log(`Room ${roomName} has 2 participants but no Redis match, creating match`);
        
        // Create a new match
        const newMatch: ActiveMatch = {
          user1,
          user2,
          roomName,
          useDemo: false, // Default to false, could be improved by checking user preferences
          matchedAt: Date.now()
        };
        
        await redis.hset(ACTIVE_MATCHES, roomName, JSON.stringify(newMatch));
        
        // Remove both users from any queues since they're now matched
        await removeUserFromQueue(user1);
        await removeUserFromQueue(user2);
        
        return {
          action: 'created_match',
          details: `Created match between ${user1} and ${user2} in room ${roomName}`
        };
      } else {
        // Check if the participants match what's in Redis
        const redisUsers = [redisMatch.user1, redisMatch.user2].sort();
        const liveKitUsers = liveKitRoom.participants.sort();
        
        if (JSON.stringify(redisUsers) !== JSON.stringify(liveKitUsers)) {
          console.log(`Room ${roomName} participants don't match Redis data, updating match`);
          
          // Update the match with current participants
          const updatedMatch: ActiveMatch = {
            ...redisMatch,
            user1: liveKitUsers[0],
            user2: liveKitUsers[1],
            matchedAt: Date.now() // Update timestamp
          };
          
          await redis.hset(ACTIVE_MATCHES, roomName, JSON.stringify(updatedMatch));
          
          // Remove all participants from queues
          for (const user of liveKitUsers) {
            await removeUserFromQueue(user);
          }
          
          return {
            action: 'updated_match',
            details: `Updated match in room ${roomName} to reflect current participants`
          };
        }
        
        // Participants match, ensure they're not in any queues
        await removeUserFromQueue(redisMatch.user1);
        await removeUserFromQueue(redisMatch.user2);
        
        return {
          action: 'no_change',
          details: `Room ${roomName} state is already synchronized`
        };
      }
    }
    
    // Case 4: Room has more than 2 participants (shouldn't happen but handle it)
    if (liveKitRoom.participantCount > 2) {
      console.warn(`Room ${roomName} has ${liveKitRoom.participantCount} participants, which exceeds the limit`);
      
      // Keep the first 2 participants and remove the rest from tracking
      const [user1, user2] = liveKitRoom.participants;
      
      if (redisMatch) {
        // Update match to reflect first 2 participants
        const updatedMatch: ActiveMatch = {
          ...redisMatch,
          user1,
          user2,
          matchedAt: Date.now()
        };
        
        await redis.hset(ACTIVE_MATCHES, roomName, JSON.stringify(updatedMatch));
      } else {
        // Create new match for first 2 participants
        const newMatch: ActiveMatch = {
          user1,
          user2,
          roomName,
          useDemo: false,
          matchedAt: Date.now()
        };
        
        await redis.hset(ACTIVE_MATCHES, roomName, JSON.stringify(newMatch));
      }
      
      // Remove all participants from queues
      for (const user of liveKitRoom.participants) {
        await removeUserFromQueue(user);
      }
      
      return {
        action: 'updated_match',
        details: `Updated room ${roomName} to track first 2 of ${liveKitRoom.participantCount} participants`
      };
    }
    
    return {
      action: 'no_change',
      details: `No action needed for room ${roomName}`
    };
    
  } catch (error) {
    console.error(`Error syncing room state for ${roomName}:`, error);
    return {
      action: 'no_change',
      details: `Error syncing room ${roomName}: ${error}`
    };
  }
}

/**
 * Synchronize all rooms between LiveKit and Redis
 */
export async function syncAllRooms(): Promise<{
  roomsProcessed: number;
  actions: Array<{ roomName: string; action: string; details: string }>;
  errors: string[];
}> {
  const result = {
    roomsProcessed: 0,
    actions: [] as Array<{ roomName: string; action: string; details: string }>,
    errors: [] as string[]
  };
  
  try {
    // Get all rooms from both LiveKit and Redis
    const liveKitRooms = await getAllLiveKitRooms();
    const redisMatches = await redis.hgetall(ACTIVE_MATCHES);
    
    // Create a set of all room names to process
    const allRoomNames = new Set<string>();
    
    // Add LiveKit rooms
    liveKitRooms.forEach(room => allRoomNames.add(room.roomName));
    
    // Add Redis rooms
    Object.keys(redisMatches).forEach(roomName => allRoomNames.add(roomName));
    
    console.log(`Syncing ${allRoomNames.size} rooms between LiveKit and Redis`);
    
    // Process each room
    for (const roomName of allRoomNames) {
      try {
        const syncResult = await syncRoomState(roomName);
        
        result.actions.push({
          roomName,
          action: syncResult.action,
          details: syncResult.details
        });
        
        result.roomsProcessed++;
      } catch (error) {
        const errorMsg = `Error syncing room ${roomName}: ${error}`;
        result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
    
    console.log(`Room sync completed: ${result.roomsProcessed} rooms processed, ${result.actions.filter(a => a.action !== 'no_change').length} actions taken`);
    
  } catch (error) {
    const errorMsg = `Error in syncAllRooms: ${error}`;
    result.errors.push(errorMsg);
    console.error(errorMsg);
  }
  
  return result;
}

/**
 * Handle participant connection event from LiveKit webhook
 */
export async function handleParticipantConnected(roomName: string, participantIdentity: string): Promise<void> {
  console.log(`Participant ${participantIdentity} connected to room ${roomName}`);
  
  // Sync the room state to ensure Redis is updated
  await syncRoomState(roomName);
}

/**
 * Handle participant disconnection event from LiveKit webhook
 */
export async function handleParticipantDisconnected(roomName: string, participantIdentity: string): Promise<void> {
  console.log(`Participant ${participantIdentity} disconnected from room ${roomName}`);
  
  // Add a small delay to allow for potential reconnections
  setTimeout(async () => {
    await syncRoomState(roomName);
  }, 3000); // 3 second delay
}

/**
 * Start periodic room synchronization
 */
let syncInterval: NodeJS.Timeout | null = null;

export function startPeriodicSync(intervalMs: number = 30000): void {
  if (syncInterval) {
    console.log('Periodic room sync is already running');
    return;
  }
  
  console.log(`Starting periodic room sync every ${intervalMs}ms`);
  
  syncInterval = setInterval(async () => {
    try {
      const result = await syncAllRooms();
      const actionCount = result.actions.filter(a => a.action !== 'no_change').length;
      
      if (actionCount > 0) {
        console.log(`Periodic sync: ${actionCount} actions taken across ${result.roomsProcessed} rooms`);
      }
      
      if (result.errors.length > 0) {
        console.error(`Periodic sync errors:`, result.errors);
      }
    } catch (error) {
      console.error('Error in periodic room sync:', error);
    }
  }, intervalMs);
}

export function stopPeriodicSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('Stopped periodic room sync');
  }
} 