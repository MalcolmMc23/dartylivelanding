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
    
    // For the user INITIATING the disconnect (username), the response should be simpler.
    // They are disconnecting, so they shouldn't get an "immediate_match" status related to the other user.
    // Their client will take them to the reset page.

    if (result.status === 'disconnected_with_immediate_match' && result.immediateMatch) {
      console.log(`Left-behind user ${result.leftBehindUser} was immediately matched with ${result.immediateMatch.matchedWith}`);
      
      return NextResponse.json({
        status: 'disconnected_other_matched', // New status for the disconnecting user
        roomWasActive: roomInfo?.isActive || false,
        roomUsers: roomInfo?.users || [],
        leftBehindUser: result.leftBehindUser,
        // Details for the left-behind user, not for the current user's redirection
        detailsForLeftBehind: {
            newRoomName: result.newRoomName,
            immediateMatch: result.immediateMatch,
        },
        timestamp: Date.now()
      });
    }
    
    // Standard disconnection response if the other user wasn't immediately matched
    return NextResponse.json({
      status: result.status, // e.g., 'disconnected', 'no_match_found'
      roomWasActive: roomInfo?.isActive || false,
      roomUsers: roomInfo?.users || [],
      leftBehindUser: result.leftBehindUser,
      // Details for the left-behind user
      detailsForLeftBehind: {
        newRoomName: result.newRoomName, 
      },
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