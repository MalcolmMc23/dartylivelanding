import redis from '../../lib/redis';
import { RoomServiceClient } from 'livekit-server-sdk';
import { ROOM_PARTICIPANTS, ROOM_STATES, ACTIVE_MATCHES } from './constants';
import { RoomState, RoomParticipant } from './types';
import { acquireMatchLock, releaseMatchLock } from './lockManager';

// Get LiveKit configuration
function getLiveKitConfig(useDemo: boolean = false) {
  if (useDemo) {
    return {
      apiKey: 'devkey',
      apiSecret: 'secret',
      host: 'demo.livekit.cloud'
    };
  }
  
  return {
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    host: process.env.LIVEKIT_HOST || ''
  };
}

/**
 * Get or create a RoomServiceClient instance
 */
function getRoomServiceClient(useDemo: boolean = false): RoomServiceClient | null {
  const config = getLiveKitConfig(useDemo);
  
  if (!config.apiKey || !config.apiSecret || !config.host) {
    console.error('LiveKit configuration missing');
    return null;
  }
  
  return new RoomServiceClient(
    `https://${config.host}`,
    config.apiKey,
    config.apiSecret
  );
}

/**
 * Update room state in Redis based on LiveKit data
 */
export async function updateRoomState(
  roomName: string, 
  participants: RoomParticipant[],
  isActive: boolean = true
): Promise<void> {
  const now = Date.now();
  
  const roomState: RoomState = {
    roomName,
    participants,
    createdAt: now, // Will be overwritten if room already exists
    lastUpdated: now,
    maxParticipants: 2,
    isActive
  };
  
  // Get existing room state to preserve createdAt
  const existingStateStr = await redis.hget(ROOM_STATES, roomName);
  if (existingStateStr) {
    try {
      const existingState = JSON.parse(existingStateStr) as RoomState;
      roomState.createdAt = existingState.createdAt;
    } catch (e) {
      console.error('Error parsing existing room state:', e);
    }
  }
  
  // Update room state
  await redis.hset(ROOM_STATES, roomName, JSON.stringify(roomState));
  
  // Update participant list for quick lookups
  const participantIdentities = participants.map(p => p.identity);
  if (participantIdentities.length > 0) {
    await redis.hset(ROOM_PARTICIPANTS, roomName, JSON.stringify(participantIdentities));
  } else {
    // Remove empty rooms
    await redis.hdel(ROOM_PARTICIPANTS, roomName);
  }
  
  console.log(`Updated room state for ${roomName}: ${participants.length} participants, active: ${isActive}`);
}

/**
 * Sync a specific room's state from LiveKit to Redis
 */
export async function syncRoomFromLiveKit(
  roomName: string,
  useDemo: boolean = false
): Promise<RoomState | null> {
  const roomService = getRoomServiceClient(useDemo);
  if (!roomService) {
    console.error('Could not create RoomServiceClient');
    return null;
  }
  
  try {
    // Get participants from LiveKit
    const participants = await roomService.listParticipants(roomName);
    
    // Convert to our format
    const roomParticipants: RoomParticipant[] = participants.map(p => ({
      identity: p.identity,
      joinedAt: p.joinedAt ? Number(p.joinedAt) * 1000 : Date.now(), // Convert seconds to ms
      metadata: p.metadata
    }));
    
    // Update Redis
    await updateRoomState(roomName, roomParticipants, true);
    
    // Return the updated state
    const stateStr = await redis.hget(ROOM_STATES, roomName);
    return stateStr ? JSON.parse(stateStr) : null;
    
  } catch (error) {
    // Room might not exist in LiveKit
    console.log(`Could not sync room ${roomName} from LiveKit:`, error);
    
    // Mark room as inactive in Redis
    await updateRoomState(roomName, [], false);
    return null;
  }
}

/**
 * Sync all active rooms from Redis with LiveKit
 */
export async function syncAllRoomsWithLiveKit(): Promise<{
  synced: number;
  errors: number;
  cleaned: number;
}> {
  const lockId = `sync-all-rooms-${Date.now()}`;
  let lockAcquired = false;
  
  const result = {
    synced: 0,
    errors: 0,
    cleaned: 0
  };
  
  try {
    // Acquire lock to prevent concurrent syncs
    lockAcquired = await acquireMatchLock(lockId, 10000); // 10 second timeout
    
    if (!lockAcquired) {
      console.log('Could not acquire lock for room sync');
      return result;
    }
    
    console.log('Starting full room synchronization with LiveKit');
    
    // Get all active matches
    const activeMatches = await redis.hgetall(ACTIVE_MATCHES);
    const roomNames = Object.keys(activeMatches);
    
    // Also get all rooms from ROOM_STATES
    const roomStates = await redis.hgetall(ROOM_STATES);
    const stateRoomNames = Object.keys(roomStates);
    
    // Combine and deduplicate room names
    const allRoomNames = [...new Set([...roomNames, ...stateRoomNames])];
    
    console.log(`Syncing ${allRoomNames.length} rooms with LiveKit`);
    
    // Sync each room
    for (const roomName of allRoomNames) {
      try {
        const matchDataStr = activeMatches[roomName];
        const useDemo = matchDataStr ? JSON.parse(matchDataStr).useDemo : false;
        
        const roomState = await syncRoomFromLiveKit(roomName, useDemo);
        
        if (roomState && roomState.participants.length > 0) {
          result.synced++;
        } else {
          // Room is empty or doesn't exist
          result.cleaned++;
          
          // Clean up empty rooms
          await redis.hdel(ACTIVE_MATCHES, roomName);
          await redis.hdel(ROOM_STATES, roomName);
          await redis.hdel(ROOM_PARTICIPANTS, roomName);
        }
      } catch (error) {
        console.error(`Error syncing room ${roomName}:`, error);
        result.errors++;
      }
    }
    
    console.log(`Room sync complete: ${result.synced} synced, ${result.cleaned} cleaned, ${result.errors} errors`);
    
  } finally {
    if (lockAcquired) {
      await releaseMatchLock(lockId);
    }
  }
  
  return result;
}

/**
 * Get current participants in a room from Redis (cached)
 */
export async function getRoomParticipants(roomName: string): Promise<string[]> {
  const participantsStr = await redis.hget(ROOM_PARTICIPANTS, roomName);
  if (!participantsStr) {
    return [];
  }
  
  try {
    return JSON.parse(participantsStr);
  } catch (e) {
    console.error('Error parsing room participants:', e);
    return [];
  }
}

/**
 * Check if a room has capacity for more participants
 */
export async function roomHasCapacity(roomName: string, maxParticipants: number = 2): Promise<boolean> {
  const participants = await getRoomParticipants(roomName);
  return participants.length < maxParticipants;
}

/**
 * Handle participant joined event from LiveKit webhook
 */
export async function handleParticipantJoined(
  roomName: string,
  participantIdentity: string,
  metadata?: string
): Promise<void> {
  console.log(`Handling participant joined: ${participantIdentity} in room ${roomName}`);
  
  // Get current room state
  const stateStr = await redis.hget(ROOM_STATES, roomName);
  let roomState: RoomState;
  
  if (stateStr) {
    roomState = JSON.parse(stateStr);
  } else {
    // Create new room state
    roomState = {
      roomName,
      participants: [],
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      maxParticipants: 2,
      isActive: true
    };
  }
  
  // Add participant if not already present
  const existingIndex = roomState.participants.findIndex(p => p.identity === participantIdentity);
  if (existingIndex === -1) {
    roomState.participants.push({
      identity: participantIdentity,
      joinedAt: Date.now(),
      metadata
    });
  }
  
  // Update room state
  await updateRoomState(roomName, roomState.participants, true);
}

/**
 * Handle participant left event from LiveKit webhook
 */
export async function handleParticipantLeft(
  roomName: string,
  participantIdentity: string
): Promise<void> {
  console.log(`Handling participant left: ${participantIdentity} from room ${roomName}`);
  
  // Get current room state
  const stateStr = await redis.hget(ROOM_STATES, roomName);
  if (!stateStr) {
    console.warn(`No room state found for ${roomName}`);
    return;
  }
  
  const roomState: RoomState = JSON.parse(stateStr);
  
  // Remove participant
  roomState.participants = roomState.participants.filter(p => p.identity !== participantIdentity);
  
  // Update room state
  await updateRoomState(roomName, roomState.participants, roomState.participants.length > 0);
  
  // If room is empty, clean up
  if (roomState.participants.length === 0) {
    console.log(`Room ${roomName} is now empty, cleaning up`);
    await redis.hdel(ACTIVE_MATCHES, roomName);
    await redis.hdel(ROOM_STATES, roomName);
    await redis.hdel(ROOM_PARTICIPANTS, roomName);
  }
}

/**
 * Clean up stale room data
 */
export async function cleanupStaleRooms(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
  const roomStates = await redis.hgetall(ROOM_STATES);
  let cleaned = 0;
  
  for (const [roomName, stateStr] of Object.entries(roomStates)) {
    try {
      const roomState: RoomState = JSON.parse(stateStr);
      
      // Check if room is stale
      const age = Date.now() - roomState.lastUpdated;
      if (age > maxAgeMs && roomState.participants.length === 0) {
        console.log(`Cleaning up stale room ${roomName} (age: ${age}ms)`);
        
        await redis.hdel(ROOM_STATES, roomName);
        await redis.hdel(ROOM_PARTICIPANTS, roomName);
        await redis.hdel(ACTIVE_MATCHES, roomName);
        
        cleaned++;
      }
    } catch (e) {
      console.error(`Error processing room ${roomName}:`, e);
    }
  }
  
  return cleaned;
} 