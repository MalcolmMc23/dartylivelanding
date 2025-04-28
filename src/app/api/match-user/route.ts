import { NextRequest, NextResponse } from 'next/server';
import { 
  matchingState, 
  cleanupOldWaitingUsers, 
  cleanupOldMatches,
  WaitingUser 
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
    
    // Check if there are any users in the waiting queue we can match with
    // But avoid matching with the same user they just left
    if (matchingState.waitingUsers.length > 0) {
      // Default time window to avoid re-matching (5 minutes in ms)
      const REMATCH_COOLDOWN = 5 * 60 * 1000;
      const now = Date.now();

      // Find an appropriate match - prioritize wait time but avoid recent matches
      // Sort users by join time (oldest first)
      const sortedWaitingUsers = [...matchingState.waitingUsers].sort((a, b) => a.joinedAt - b.joinedAt);
      
      let matchedUser = null;
      let matchedUserIndex = -1;
      
      // Find the first eligible match (not the same user they just left)
      for (let i = 0; i < sortedWaitingUsers.length; i++) {
        const candidateUser = sortedWaitingUsers[i];
        
        // Skip if this is the same user they just left and it's within the cooldown period
        const isRecentMatch = candidateUser.lastMatch 
                              && candidateUser.lastMatch.matchedWith === username
                              && (now - candidateUser.lastMatch.timestamp) < REMATCH_COOLDOWN;
        
        // Skip if the current user has a lastMatch that points to this candidate and is recent
        const userHasRecentMatch = body.lastMatch 
                                  && body.lastMatch.matchedWith === candidateUser.username
                                  && (now - body.lastMatch.timestamp) < REMATCH_COOLDOWN;
        
        if (!isRecentMatch && !userHasRecentMatch) {
          // Found a match!
          matchedUser = candidateUser;
          matchedUserIndex = matchingState.waitingUsers.findIndex(
            user => user.username === candidateUser.username
          );
          break;
        }
      }
      
      if (matchedUser && matchedUserIndex >= 0) {
        // Remove the matched user from the queue
        matchingState.waitingUsers.splice(matchedUserIndex, 1);
        
        // Generate a unique room name for these two users
        const roomName = `match-${Math.random().toString(36).substring(2, 10)}`;
        
        console.log(`Matched users: ${username} and ${matchedUser.username} in room ${roomName}`);
        
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
    }
    
    // No eligible match found, add this user to the queue
    const newUser: WaitingUser = {
      username,
      joinedAt: Date.now(),
      useDemo,
      lastMatch: body.lastMatch
    };
    matchingState.waitingUsers.push(newUser);
    
    console.log(`Added ${username} to waiting queue. Current queue size: ${matchingState.waitingUsers.length}`);
    
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
      matchingState.waitingUsers = matchingState.waitingUsers.filter(user => user.username !== username);
      
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