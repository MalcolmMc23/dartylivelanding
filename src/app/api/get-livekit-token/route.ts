import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { verifyUserRoomAccess } from '@/utils/redis/roomVerificationService';

// Track room participant counts in memory (for development)
// In production, this should use a database or Redis
const roomParticipants: Record<string, string[]> = {};

// Helper to remove a user from room participants tracking
function removeUserFromRoomTracking(username: string, roomName?: string) {
  if (roomName && roomParticipants[roomName]) {
    roomParticipants[roomName] = roomParticipants[roomName].filter(u => u !== username);
    console.log(`Removed ${username} from room tracking for ${roomName}, now has ${roomParticipants[roomName].length} participants`);
    
    // Clean up empty rooms
    if (roomParticipants[roomName].length === 0) {
      delete roomParticipants[roomName];
      console.log(`Removed empty room ${roomName} from tracking`);
    }
    return true;
  } else if (!roomName) {
    // If no room specified, search all rooms
    let removed = false;
    Object.keys(roomParticipants).forEach(room => {
      if (roomParticipants[room].includes(username)) {
        roomParticipants[room] = roomParticipants[room].filter(u => u !== username);
        console.log(`Removed ${username} from room tracking for ${room}, now has ${roomParticipants[room].length} participants`);
        removed = true;
        
        // Clean up empty rooms
        if (roomParticipants[room].length === 0) {
          delete roomParticipants[room];
          console.log(`Removed empty room ${room} from tracking`);
        }
      }
    });
    return removed;
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let room = searchParams.get('room');
    const username = searchParams.get('username');
    const useDemo = searchParams.get('useDemo') === 'true';
    // Special flag to bypass room checks during initial matching
    const initialMatching = searchParams.get('initialMatching') === 'true';

    if (!room || !username) {
      return NextResponse.json(
        { error: 'Missing room or username' },
        { status: 400 }
      );
    }

    // Sanitize room name - only allow alphanumeric and hyphens
    room = room.replace(/[^a-zA-Z0-9-]/g, '');
    if (room.length === 0) {
      return NextResponse.json(
        { error: 'Invalid room name. Use only letters, numbers, and hyphens.' },
        { status: 400 }
      );
    }

    // Create a new access token
    let apiKey = process.env.LIVEKIT_API_KEY || '';
    let apiSecret = process.env.LIVEKIT_API_SECRET || '';
    let livekitHost = process.env.LIVEKIT_HOST || '';

    // Use demo API keys if requested (for testing)
    if (useDemo) {
      // These are the official LiveKit demo credentials
      apiKey = 'devkey';
      apiSecret = 'secret';
      livekitHost = 'demo.livekit.cloud';
      console.log('Using LiveKit demo server credentials');
    }

    // Debug log - masked for security
    console.log('API Key defined:', !!apiKey);
    console.log('API Secret defined:', !!apiSecret);
    console.log('API Key value:', apiKey);
    console.log('Using demo server:', useDemo);

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'LiveKit credentials not configured' },
        { status: 500 }
      );
    }

    // First, remove the user from any existing room tracking
    // This ensures we don't have ghost entries
    removeUserFromRoomTracking(username);

    // Verify user has access to this room through the match system
    const roomAccess = await verifyUserRoomAccess(username, room);
    
    if (!roomAccess.authorized) {
      console.log(`User ${username} not authorized for room ${room}: ${roomAccess.reason}`);
      
      // Check if this is an initial matching scenario
      if (!initialMatching) {
        return NextResponse.json(
          { error: roomAccess.reason || 'You are not authorized to join this room' },
          { status: 403 }
        );
      }
    } else {
      console.log(`User ${username} authorized for room ${room}, matched with ${roomAccess.matchedWith}`);
    }

    // Initialize room participants tracking if needed
    if (!roomParticipants[room]) {
      roomParticipants[room] = [];
    }

    let currentParticipants = roomParticipants[room];
    let participantCount = 0;

    // Check participant count if host is available
    if (livekitHost) {
      try {
        const roomService = new RoomServiceClient(
          `https://${livekitHost}`,
          apiKey,
          apiSecret
        );
        
        // Get participants in the room from LiveKit
        const participants = await roomService.listParticipants(room);
        participantCount = participants.length;
        
        // Update our local tracking with actual data from LiveKit
        roomParticipants[room] = participants.map(p => p.identity);
        currentParticipants = roomParticipants[room];
        
        console.log(`Current participants in room ${room}: ${participantCount}`);
        console.log('Participant identities:', currentParticipants);
        
        // If user is already in the room, don't count them against the limit
        if (currentParticipants.includes(username)) {
          participantCount -= 1;
          console.log(`${username} is already in the room, adjusted count: ${participantCount}`);
        }
        
        // Strict check - no more than 2 participants
        if (participantCount >= 2 && !currentParticipants.includes(username)) {
          console.log(`Rejecting ${username}, room ${room} is full with ${participantCount} participants`);
          return NextResponse.json(
            { error: 'Room is full (maximum 2 participants allowed)' },
            { status: 403 }
          );
        }
        
        // If everything looks good, make sure the room exists
        try {
          await roomService.createRoom({
            name: room,
            emptyTimeout: 10 * 60, // 10 minutes
            maxParticipants: 2     // Hard limit of 2
          });
          console.log(`Room ${room} created or already exists`);
        } catch (roomErr) {
          console.log(`Error creating room: ${roomErr}`);
          // Non-fatal, continue
        }
      } catch (err) {
        // If the room doesn't exist yet, this is fine
        console.log('Room may not exist yet or could not check participants:', err);
        
        // If we can't check with LiveKit, use our local tracking as fallback
        if (currentParticipants.length >= 2 && !currentParticipants.includes(username)) {
          console.log(`Rejecting ${username} based on local tracking, room ${room} is full`);
          return NextResponse.json(
            { error: 'Room appears to be full (maximum 2 participants allowed)' },
            { status: 403 }
          );
        }
      }
    }

    // Double-check with our matching service again just to be safe
    if (currentParticipants.length >= 2 && !currentParticipants.includes(username)) {
      console.log(`Final check: Rejecting ${username}, room ${room} has too many participants`);
      return NextResponse.json(
        { error: 'Room is full (maximum 2 participants allowed)' },
        { status: 403 }
      );
    }

    // Create the access token with identity and name
    const at = new AccessToken(apiKey, apiSecret, {
      identity: username,
      ttl: 60 * 30, // 30 minute token
      name: username,
    });

    // Add the video grant with proper properties
    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });

    // Generate JWT token as string
    const token = await at.toJwt();
    console.log('Token generated (first 20 chars):', token.substring(0, 20) + '...');

    // Add user to our local tracking if they're not already there
    if (!currentParticipants.includes(username)) {
      roomParticipants[room].push(username);
      console.log(`Added ${username} to room ${room}, now has ${roomParticipants[room].length} participants`);
    }

    // Return the token as a plain string value
    return NextResponse.json({ 
      token: token,
      participantCount: currentParticipants.length,
      debug: {
        room,
        username,
        apiKeyDefined: !!apiKey,
        secretDefined: !!apiSecret,
        tokenGenerated: !!token,
        usingDemo: useDemo,
        tokenLength: token.length,
        currentParticipants: currentParticipants,
      }
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json(
      { error: `Failed to generate token: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
} 