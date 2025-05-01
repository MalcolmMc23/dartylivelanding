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
    const { username, roomName, otherUsername, reason = 'user_left', timestamp } = body;
    
    if (!username || !roomName) {
      return NextResponse.json(
        { error: 'Missing username or roomName' },
        { status: 400 }
      );
    }
    
    console.log(`User ${username} disconnected from room ${roomName}. Reason: ${reason}`);

    // Find the match that includes this user and room
    const matchIndex = matchingState.matchedUsers.findIndex(
      match => 
        match.roomName === roomName && 
        (match.user1 === username || match.user2 === username)
    );
    
    if (matchIndex === -1) {
      // No match found - user might have already been removed or using a custom room
      return NextResponse.json({
        status: 'not_found',
        message: 'No active match found for this user and room'
      });
    }
    
    // Get the match details
    const match = matchingState.matchedUsers[matchIndex];
    
    // Get the other user's name
    const otherUsernameFromMatch = match.user1 === username ? match.user2 : match.user1;
    
    // Remove the current match
    matchingState.matchedUsers.splice(matchIndex, 1);
    
    console.log(`Removed match between ${username} and ${otherUsernameFromMatch} in room ${roomName}`);
    
    // Check if the reason is that the user wanted to find a new match
    if (reason === 'find_new_match') {
      // Add both users back to the waiting queue
      
      // Store information about the last match to prevent immediate re-matching
      const currentTimestamp = timestamp || Date.now();
      const lastMatchInfo = {
        matchedWith: otherUsernameFromMatch,
        timestamp: currentTimestamp
      };
      
      // Add the disconnected user to the waiting queue
      const user1: WaitingUser = {
        username,
        joinedAt: currentTimestamp,
        useDemo: match.useDemo,
        lastMatch: lastMatchInfo
      };
      addUserToQueue(user1);
      
      // Add the other user to the waiting queue (they'll be matched when they poll)
      const user2: WaitingUser = {
        username: otherUsernameFromMatch,
        joinedAt: currentTimestamp,
        useDemo: match.useDemo,
        lastMatch: {
          matchedWith: username,
          timestamp: currentTimestamp
        }
      };
      addUserToQueue(user2);
      
      console.log(`Added both ${username} and ${otherUsernameFromMatch} back to the waiting queue with lastMatch information`);
      
      return NextResponse.json({
        status: 'success',
        message: 'Both users added back to matching queue',
        otherUser: otherUsernameFromMatch,
        timestamp: currentTimestamp
      });
    } else if (reason === 'user_left') {
      // The user left the call normally
      // Determine which user is still in the call (either specified in otherUsername or inferred)
      // If otherUsername is provided, that's the user who made the API call (remaining in the call)
      const remainingUsername = otherUsername || otherUsernameFromMatch;
      
      // Add the remaining user to the waiting queue with inCall flag
      // so they can be matched with a new user while staying in the same call
      const remainingUser: WaitingUser = {
        username: remainingUsername,
        joinedAt: Date.now(),
        useDemo: match.useDemo,
        inCall: true,
        roomName: roomName,
        lastMatch: {
          matchedWith: otherUsername ? username : otherUsernameFromMatch,
          timestamp: Date.now()
        }
      };
      
      // Add the remaining user to the queue
      addUserToQueue(remainingUser);
      
      console.log(`Added ${remainingUsername} to waiting queue with inCall flag. They will remain in room ${roomName} until matched.`);
    }
    
    // If it's just a normal disconnect, we'll let the other user handle their own status
    return NextResponse.json({
      status: 'success',
      message: 'User disconnected and match cleared',
      otherUser: otherUsernameFromMatch
    });
  } catch (error) {
    console.error('Error in user-disconnect:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 