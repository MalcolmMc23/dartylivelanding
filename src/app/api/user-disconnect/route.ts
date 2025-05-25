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
    
    // Handle different disconnect scenarios
    if (reason === 'user_left' || reason === 'user_disconnected') {
      // This is a SKIP scenario - both users go back to queue
      const result = await hybridMatchingService.handleUserSkip(
        username, 
        roomName,
        otherUsername
      );
      
      return NextResponse.json({
        status: 'both_users_skipped',
        skippingUser: username,
        otherUser: result.otherUser,
        message: 'Both users have been put back into the queue',
        roomWasActive: roomInfo?.isActive || false,
        timestamp: Date.now()
      });
    } else if (reason === 'session_end') {
      // This is an END CALL scenario - user who clicked END goes to main screen, other user goes to queue
      const result = await hybridMatchingService.handleSessionEnd(
        username, 
        roomName,
        otherUsername
      );
      
      return NextResponse.json({
        status: 'session_ended',
        endedBy: username,
        otherUser: result.otherUser,
        otherUserRequeued: result.otherUserRequeued,
        message: `${username} ended the call. ${result.otherUser} was put back in queue.`,
        roomWasActive: roomInfo?.isActive || false,
        timestamp: Date.now()
      });
    } else {
      // Handle other disconnect reasons (browser_closed, component_cleanup, etc.) with the original logic
      const result = await hybridMatchingService.handleUserDisconnection(
        username, 
        roomName,
        otherUsername
      );
      
      return NextResponse.json({
        status: result.status || 'disconnected',
        roomWasActive: roomInfo?.isActive || false,
        roomUsers: roomInfo?.users || [],
        leftBehindUser: result.leftBehindUser,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.error('Error handling user disconnection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 