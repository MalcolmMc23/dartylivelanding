import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';

// When a user disconnects, notify the system so we can take appropriate action
export async function POST(request: NextRequest) {
  try {
    const { username, roomName, otherUsername, reason } = await request.json();
    
    console.log(`User disconnection event: ${username} from room ${roomName}. Reason: ${reason}`);
    
    if (!username || !roomName) {
      return NextResponse.json(
        { error: 'Missing username or roomName' },
        { status: 400 }
      );
    }
    
    // Clean up stale records first to ensure we're working with fresh data
    await hybridMatchingService.cleanupOldWaitingUsers();
    await hybridMatchingService.cleanupOldMatches();
    
    // Get room info to check if it's a valid match
    const roomInfo = await hybridMatchingService.getRoomInfo(roomName);
    
    // Handle the disconnection with the hybrid matching service
    const result = await hybridMatchingService.handleUserDisconnection(
      username, 
      roomName,
      otherUsername
    );
    
    // Add debugging information about the room before disconnection
    return NextResponse.json({
      status: result.status,
      roomWasActive: roomInfo?.isActive || false,
      roomUsers: roomInfo?.users || [],
      leftBehindUser: result.leftBehindUser,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error handling user disconnection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 