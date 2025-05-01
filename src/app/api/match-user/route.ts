import { NextRequest, NextResponse } from 'next/server';
import { 
  matchingState, 
  cleanupOldWaitingUsers, 
  cleanupOldMatches,
  WaitingUser,
  addUserToQueue,
  removeUserFromQueue,
  getPrioritizedMatch
} from '@/utils/matchingService';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { username, useDemo = false } = body;
    
    if (!username) {
      return NextResponse.json(
        { error: 'Missing username' },
        { status: 400 }
      );
    }
    
    // Clean up stale users and matches
    cleanupOldWaitingUsers();
    cleanupOldMatches();
    
    // Check if this user is already in a match
    const existingMatch = matchingState.matchedUsers.find(
      match => match.user1 === username || match.user2 === username
    );
    
    if (existingMatch) {
      // Return the match info
      return NextResponse.json({
        status: 'matched',
        roomName: existingMatch.roomName,
        matchedWith: existingMatch.user1 === username ? existingMatch.user2 : existingMatch.user1,
        useDemo: existingMatch.useDemo
      });
    }
    
    // Check if this user is already in the waiting queue
    const existingUserIndex = matchingState.waitingUsers.findIndex(
      user => user.username === username
    );
    
    if (existingUserIndex >= 0) {
      // Update this user's timestamp to keep them in the queue
      matchingState.waitingUsers[existingUserIndex].joinedAt = Date.now();
      
      return NextResponse.json({
        status: 'waiting',
        message: 'You are still in the waiting queue'
      });
    }
    
    // Use our enhanced matching logic to find the best match
    const matchedUser = getPrioritizedMatch(username, body.lastMatch);
    
    if (matchedUser) {
      // Remove the matched user from the queue
      removeUserFromQueue(matchedUser.username);
      
      // If the matched user is already in a call, use their existing room
      const roomName = matchedUser.inCall 
        ? matchedUser.roomName! // Non-null assertion is safe since we checked inCall === true
        : `match-${Math.random().toString(36).substring(2, 10)}`;
      
      console.log(`Matched user ${username} with ${matchedUser.username}${matchedUser.inCall ? ' who was alone in room ' + roomName : ''}`);
      
      // Use the demo server setting from the first user if it was enabled
      const finalUseDemo = useDemo || matchedUser.useDemo;
      
      // Store the match
      matchingState.matchedUsers.push({
        user1: username,
        user2: matchedUser.username,
        roomName,
        useDemo: finalUseDemo,
        matchedAt: Date.now()
      });
      
      return NextResponse.json({
        status: 'matched',
        roomName,
        matchedWith: matchedUser.username,
        useDemo: finalUseDemo
      });
    }
    
    // No eligible match found, add this user to the queue
    const newUser: WaitingUser = {
      username,
      joinedAt: Date.now(),
      useDemo,
      lastMatch: body.lastMatch
    };
    
    // Add user to the end of the queue
    addUserToQueue(newUser);
    
    return NextResponse.json({
      status: 'waiting',
      message: 'Added to waiting queue'
    });
  } catch (error) {
    console.error('Error in match-user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// API to check status and/or cancel waiting
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const action = searchParams.get('action');
    
    if (!username) {
      return NextResponse.json(
        { error: 'Missing username parameter' },
        { status: 400 }
      );
    }
    
    // Clean up stale users and matches
    cleanupOldWaitingUsers();
    cleanupOldMatches();
    
    // Check if user has been matched
    const existingMatch = matchingState.matchedUsers.find(
      match => match.user1 === username || match.user2 === username
    );
    
    if (existingMatch && action !== 'cancel') {
      return NextResponse.json({
        status: 'matched',
        roomName: existingMatch.roomName,
        matchedWith: existingMatch.user1 === username ? existingMatch.user2 : existingMatch.user1,
        useDemo: existingMatch.useDemo
      });
    }
    
    // Handle cancel action
    if (action === 'cancel') {
      // Remove from waiting queue
      const initialLength = matchingState.waitingUsers.length;
      removeUserFromQueue(username);
      
      // Also remove any matches
      const initialMatchLength = matchingState.matchedUsers.length;
      matchingState.matchedUsers = matchingState.matchedUsers.filter(match => 
        match.user1 !== username && match.user2 !== username
      );
      
      const wasRemoved = initialLength > matchingState.waitingUsers.length || initialMatchLength > matchingState.matchedUsers.length;
      
      return NextResponse.json({
        status: wasRemoved ? 'cancelled' : 'not_found',
        message: wasRemoved 
          ? 'Successfully removed from waiting/match queue' 
          : 'User not found in waiting queue'
      });
    }
    
    // Check status
    const isWaiting = matchingState.waitingUsers.some(user => user.username === username);
    
    return NextResponse.json({
      status: isWaiting ? 'waiting' : 'not_waiting',
      position: isWaiting 
        ? matchingState.waitingUsers.findIndex(user => user.username === username) + 1 
        : null,
      queueSize: matchingState.waitingUsers.length
    });
  } catch (error) {
    console.error('Error in match-user GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 