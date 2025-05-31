import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

// LiveKit configuration
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_HOST = process.env.LIVEKIT_HOST || '';

// Validate LiveKit configuration
if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_HOST) {
  console.warn('LiveKit configuration missing. Video chat will not work properly.');
}

// Create room service client
const roomService = new RoomServiceClient(
  LIVEKIT_HOST,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

/**
 * Generate a LiveKit access token for a user
 */
export async function generateToken(roomName: string, userId: string): Promise<string> {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
  });

  // Grant permissions for the room
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  // Set token expiration (24 hours)
  token.ttl = '24h';

  return await token.toJwt();
}

/**
 * Create a new LiveKit room
 */
export async function createRoom(roomName: string): Promise<unknown> {
  try {
    const room = await roomService.createRoom({
      name: roomName,
      // Optional room configuration
      emptyTimeout: 300, // 5 minutes
      maxParticipants: 2,
    });
    return room;
  } catch (error) {
    console.error('Error creating LiveKit room:', error);
    throw error;
  }
}

/**
 * Delete a LiveKit room
 */
export async function deleteRoom(roomName: string) {
  try {
    await roomService.deleteRoom(roomName);
  } catch (error) {
    console.error('Error deleting LiveKit room:', error);
    // Don't throw - room might already be deleted
  }
}

/**
 * Get room information
 */
export async function getRoom(roomName: string) {
  try {
    const rooms = await roomService.listRooms([roomName]);
    return rooms[0];
  } catch (error) {
    console.error('Error getting LiveKit room:', error);
    return null;
  }
}

/**
 * List participants in a room
 */
export async function listParticipants(roomName: string) {
  try {
    const participants = await roomService.listParticipants(roomName);
    return participants;
  } catch (error) {
    console.error('Error listing participants:', error);
    return [];
  }
} 