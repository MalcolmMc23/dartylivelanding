import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';

// When a user disconnects, notify the system so we can take appropriate action
export async function POST(request: NextRequest) {
  try {
    const { username, roomName, otherUsername, reason = 'user_disconnected' } = await request.json();
    
    if (!username || !roomName) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    console.log(`User disconnection event: ${username} from room ${roomName}. Reason: ${reason}`);
    
    // Handle the disconnection and add the left-behind user to the queue
    const result = await hybridMatchingService.handleUserDisconnection(username, roomName, otherUsername);
    
    if (result.status === 'no_match_found') {
      return NextResponse.json({ 
        status: 'no_match_found',
        message: 'No active match found with this room name'
      });
    }
    
    return NextResponse.json({
      status: 'disconnected',
      message: 'User disconnected and left-behind user added to waiting queue',
      leftBehindUser: result.leftBehindUser,
      users: result.users
    });
  } catch (error) {
    console.error('Error in user-disconnect:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 