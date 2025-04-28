import { NextRequest, NextResponse } from 'next/server';
import { matchingState, WaitingUser } from '@/utils/matchingService';

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
    const otherUsername = match.user1 === username ? match.user2 : match.user1;
    
    // Remove the current match
    matchingState.matchedUsers.splice(matchIndex, 1);
    
    console.log(`Removed match between ${username} and ${otherUsername} in room ${roomName}`);
    
    // Check if the reason is that the user wanted to find a new match
    if (reason === 'find_new_match') {
      // Add both users back to the waiting queue
      
      // Store information about the last match to prevent immediate re-matching
      const currentTimestamp = timestamp || Date.now();
      const lastMatchInfo = {
        matchedWith: otherUsername,
        timestamp: currentTimestamp
      };
      
      // Add the disconnected user to the waiting queue
      const user1: WaitingUser = {
        username,
        joinedAt: currentTimestamp,
        useDemo: match.useDemo,
        lastMatch: lastMatchInfo
      };
      matchingState.waitingUsers.push(user1);
      
      // Add the other user to the waiting queue (they'll be matched when they poll)
      const user2: WaitingUser = {
        username: otherUsername,
        joinedAt: currentTimestamp,
        useDemo: match.useDemo,
        lastMatch: {
          matchedWith: username,
          timestamp: currentTimestamp
        }
      };
      matchingState.waitingUsers.push(user2);
      
      console.log(`Added both ${username} and ${otherUsername} back to the waiting queue with lastMatch information`);
      
      return NextResponse.json({
        status: 'success',
        message: 'Both users added back to matching queue',
        otherUser: otherUsername,
        timestamp: currentTimestamp
      });
    }
    
    // If it's just a normal disconnect, we'll let the other user handle their own status
    return NextResponse.json({
      status: 'success',
      message: 'User disconnected and match cleared',
      otherUser: otherUsername
    });
  } catch (error) {
    console.error('Error in user-disconnect:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 