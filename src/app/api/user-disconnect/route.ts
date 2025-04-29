import { NextRequest, NextResponse } from 'next/server';
import { 
  matchingState, 
  WaitingUser, 
  addUserToQueue
} from '@/utils/matchingService';

// When a user disconnects, notify the system so we can take appropriate action
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { username, roomName, reason = 'user_left', timestamp } = body;
    
    if (!username || !roomName) {
      return NextResponse.json(
        { error: 'Missing username or roomName' },
        { status: 400 }
      );
    }
    
    console.log(`----- USER DISCONNECT EVENT -----`);
    console.log(`User ${username} disconnected from room ${roomName}. Reason: ${reason}`);
    console.log(`Current matches before processing: ${matchingState.matchedUsers.length}`);
    console.log(`Current waiting users before processing: ${matchingState.waitingUsers.length}`);

    // Find the match that includes this user and room
    const matchIndex = matchingState.matchedUsers.findIndex(
      match => 
        match.roomName === roomName && 
        (match.user1 === username || match.user2 === username)
    );
    
    if (matchIndex === -1) {
      console.log(`No match found for user ${username} in room ${roomName}`);
      // No match found - user might have already been removed or using a custom room
      return NextResponse.json({
        status: 'not_found',
        message: 'No active match found for this user and room'
      });
    }
    
    // Get the match details
    const match = matchingState.matchedUsers[matchIndex];
    console.log(`Found match: ${match.user1} & ${match.user2} in room ${match.roomName}`);
    
    // Get the other user's name
    const otherUsername = match.user1 === username ? match.user2 : match.user1;
    
    // Remove the current match
    matchingState.matchedUsers.splice(matchIndex, 1);
    
    console.log(`Removed match between ${username} and ${otherUsername} in room ${roomName}`);
    console.log(`Remaining matches: ${matchingState.matchedUsers.length}`);
    
    // Instead of adding both users to the waiting queue, just clean up the match
    // This allows them to go back to the initial name input page
    console.log(`Users ${username} and ${otherUsername} will be redirected to the name input page`);
    console.log(`----- END OF DISCONNECT EVENT -----`);
    
    return NextResponse.json({
      status: 'success',
      message: 'Match removed, users will be redirected to name input',
      otherUser: otherUsername,
      timestamp: timestamp || Date.now()
    });
  } catch (error) {
    console.error('Error in user-disconnect:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 