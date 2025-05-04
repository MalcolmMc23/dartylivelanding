import { NextRequest, NextResponse } from 'next/server';
import { matchingState, addUserToQueue } from '@/utils/matchingService';

// When a user disconnects, notify the system so we can take appropriate action
export async function POST(request: NextRequest) {
  try {
    const { username, roomName, otherUsername, reason = 'user_disconnected' } = await request.json();
    
    if (!username || !roomName) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    console.log(`User disconnection event: ${username} from room ${roomName}. Reason: ${reason}`);
    
    // Find the match with this room name
    const matchIndex = matchingState.matchedUsers.findIndex(
      match => match.roomName === roomName
    );
    
    if (matchIndex >= 0) {
      // Get the match details
      const match = matchingState.matchedUsers[matchIndex];
      
      // Get both users
      const user1 = match.user1;
      const user2 = match.user2;
      
      console.log(`Found match between ${user1} and ${user2} in room ${roomName}`);
      
      // Remove the match from our tracking
      matchingState.matchedUsers.splice(matchIndex, 1);
      console.log(`Removed match between ${user1} and ${user2} due to disconnection`);
      
      // Add the left-behind user to the waiting queue with inCall=true
      if (otherUsername) {
        // If otherUsername is provided, it means they disconnected, so add 'username' to queue
        addUserToQueue({
          username: username,
          joinedAt: Date.now(),
          useDemo: match.useDemo,
          inCall: true,
          roomName: roomName,
          lastMatch: {
            matchedWith: otherUsername,
            timestamp: Date.now()
          }
        });
        console.log(`Added left-behind user ${username} back to waiting queue with inCall=true`);
      } else {
        // If no otherUsername provided, determine who's left behind (the one who's not 'username')
        const leftBehindUser = user1 === username ? user2 : user1;
        addUserToQueue({
          username: leftBehindUser,
          joinedAt: Date.now(),
          useDemo: match.useDemo,
          inCall: true,
          roomName: roomName,
          lastMatch: {
            matchedWith: username,
            timestamp: Date.now()
          }
        });
        console.log(`Added left-behind user ${leftBehindUser} back to waiting queue with inCall=true`);
      }
      
      return NextResponse.json({
        status: 'disconnected',
        message: 'User disconnected and left-behind user added to waiting queue',
        users: [user1, user2]
      });
    }
    
    return NextResponse.json({ 
      status: 'no_match_found',
      message: 'No active match found with this room name'
    });
  } catch (error) {
    console.error('Error in user-disconnect:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 