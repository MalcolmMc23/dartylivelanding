import { NextRequest, NextResponse } from 'next/server';
import { 
  matchingState, 
  cleanupOldWaitingUsers, 
  cleanupOldMatches,
  WaitingUser,
  addUserToQueue,
  removeUserFromQueue,
  REMATCH_COOLDOWN
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
    
    console.log(`----- MATCH USER REQUEST [${username}] -----`);
    console.log(`Current state: ${matchingState.waitingUsers.length} waiting, ${matchingState.matchedUsers.length} matched`);
    
    // Clean up stale users and matches
    cleanupOldWaitingUsers();
    cleanupOldMatches();
    
    // Check if this user is already in a match
    const existingMatch = matchingState.matchedUsers.find(
      match => match.user1 === username || match.user2 === username
    );
    
    if (existingMatch) {
      // Return the match info
      const matchedWith = existingMatch.user1 === username ? existingMatch.user2 : existingMatch.user1;
      console.log(`User ${username} is already in a match with ${matchedWith} in room ${existingMatch.roomName}`);
      console.log(`----- END MATCH USER REQUEST -----`);
      
      return NextResponse.json({
        status: 'matched',
        roomName: existingMatch.roomName,
        matchedWith,
        useDemo: existingMatch.useDemo
      });
    }
    
    // Check if this user is already in the waiting queue
    const existingUserIndex = matchingState.waitingUsers.findIndex(
      user => user.username === username
    );
    
    if (existingUserIndex >= 0) {
      // Update this user's timestamp to keep them in the queue
      const previousJoinTime = matchingState.waitingUsers[existingUserIndex].joinedAt;
      const waitTime = Math.floor((Date.now() - previousJoinTime) / 1000);
      console.log(`User ${username} is already in the waiting queue at position ${existingUserIndex + 1} (waiting for ${waitTime}s)`);
      
      matchingState.waitingUsers[existingUserIndex].joinedAt = Date.now();
      console.log(`Updated timestamp for ${username} in waiting queue`);
      console.log(`----- END MATCH USER REQUEST -----`);
      
      return NextResponse.json({
        status: 'waiting',
        message: 'You are still in the waiting queue'
      });
    }
    
    // Check if there are any users in the waiting queue we can match with
    // But avoid matching with the same user they just left
    if (matchingState.waitingUsers.length > 0) {
      // Use the standard cooldown time from matchingService
      const now = Date.now();
      
      console.log(`Looking for match for ${username} among ${matchingState.waitingUsers.length} waiting users`);
      console.log(`Using rematch cooldown of ${REMATCH_COOLDOWN/1000} seconds`);

      // Find an appropriate match - prioritize wait time but avoid recent matches
      // Sort users by join time (oldest first)
      const sortedWaitingUsers = [...matchingState.waitingUsers].sort((a, b) => a.joinedAt - b.joinedAt);
      
      let matchedUser = null;
      let matchedUserIndex = -1;
      
      // Find the first eligible match (not the same user they just left)
      for (let i = 0; i < sortedWaitingUsers.length; i++) {
        const candidateUser = sortedWaitingUsers[i];
        const waitTime = Math.floor((now - candidateUser.joinedAt) / 1000);
        
        console.log(`Checking candidate ${i+1}: ${candidateUser.username} (waiting for ${waitTime}s)`);
        
        // Skip if this is the same user they just left and it's within the cooldown period
        const isRecentMatch = candidateUser.lastMatch 
                              && candidateUser.lastMatch.matchedWith === username
                              && (now - candidateUser.lastMatch.timestamp) < REMATCH_COOLDOWN;
        
        // Skip if the current user has a lastMatch that points to this candidate and is recent
        const userHasRecentMatch = body.lastMatch 
                                  && body.lastMatch.matchedWith === candidateUser.username
                                  && (now - body.lastMatch.timestamp) < REMATCH_COOLDOWN;
        
        if (isRecentMatch) {
          const timeSinceMatch = Math.floor((now - candidateUser.lastMatch!.timestamp) / 1000);
          console.log(`  Skipping ${candidateUser.username} - recently matched with ${username} (${timeSinceMatch}s ago, cooldown: ${REMATCH_COOLDOWN/1000}s)`);
          continue;
        }
        
        if (userHasRecentMatch) {
          const timeSinceMatch = Math.floor((now - body.lastMatch!.timestamp) / 1000);
          console.log(`  Skipping ${candidateUser.username} - current user recently matched with them (${timeSinceMatch}s ago, cooldown: ${REMATCH_COOLDOWN/1000}s)`);
          continue;
        }
        
        if (!isRecentMatch && !userHasRecentMatch) {
          // Found a match!
          matchedUser = candidateUser;
          matchedUserIndex = matchingState.waitingUsers.findIndex(
            user => user.username === candidateUser.username
          );
          console.log(`  Found eligible match: ${candidateUser.username}`);
          break;
        }
      }
      
      if (matchedUser && matchedUserIndex >= 0) {
        // Remove the matched user from the queue
        removeUserFromQueue(matchedUser.username);
        
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
        
        console.log(`Created new match: ${username} & ${matchedUser.username} in room ${roomName}`);
        console.log(`Total active matches: ${matchingState.matchedUsers.length}`);
        console.log(`----- END MATCH USER REQUEST -----`);
        
        return NextResponse.json({
          status: 'matched',
          roomName,
          matchedWith: matchedUser.username,
          useDemo: finalUseDemo
        });
      } else {
        console.log(`No eligible match found for ${username}`);
      }
    } else {
      console.log(`No other users in the waiting queue for ${username}`);
    }
    
    // No eligible match found, add this user to the queue
    const newUser: WaitingUser = {
      username,
      joinedAt: Date.now(),
      useDemo,
      lastMatch: body.lastMatch
    };
    
    console.log(`Adding ${username} to the waiting queue`);
    
    // Add user to the end of the queue
    addUserToQueue(newUser);
    
    console.log(`----- END MATCH USER REQUEST -----`);
    
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
    
    console.log(`----- MATCH STATUS CHECK [${username}] -----`);
    if (action) {
      console.log(`Action requested: ${action}`);
    }
    
    // Clean up stale users and matches
    cleanupOldWaitingUsers();
    cleanupOldMatches();
    
    // Check if user has been matched
    const existingMatch = matchingState.matchedUsers.find(
      match => match.user1 === username || match.user2 === username
    );
    
    if (existingMatch && action !== 'cancel') {
      const matchedWith = existingMatch.user1 === username ? existingMatch.user2 : existingMatch.user1;
      console.log(`User ${username} is matched with ${matchedWith} in room ${existingMatch.roomName}`);
      console.log(`----- END MATCH STATUS CHECK -----`);
      
      return NextResponse.json({
        status: 'matched',
        roomName: existingMatch.roomName,
        matchedWith,
        useDemo: existingMatch.useDemo
      });
    }
    
    // Handle cancel action
    if (action === 'cancel') {
      console.log(`Cancelling match/waiting for ${username}`);
      
      // Remove from waiting queue
      const initialLength = matchingState.waitingUsers.length;
      removeUserFromQueue(username);
      
      // Also remove any matches
      const initialMatchLength = matchingState.matchedUsers.length;
      matchingState.matchedUsers = matchingState.matchedUsers.filter(match => 
        match.user1 !== username && match.user2 !== username
      );
      
      const wasRemoved = initialLength > matchingState.waitingUsers.length || initialMatchLength > matchingState.matchedUsers.length;
      
      console.log(`Cancellation result: ${wasRemoved ? 'User removed' : 'User not found'}`);
      console.log(`----- END MATCH STATUS CHECK -----`);
      
      return NextResponse.json({
        status: wasRemoved ? 'cancelled' : 'not_found',
        message: wasRemoved 
          ? 'Successfully removed from waiting/match queue' 
          : 'User not found in waiting queue'
      });
    }
    
    // Check status
    const isWaiting = matchingState.waitingUsers.some(user => user.username === username);
    const userPosition = isWaiting ? 
      matchingState.waitingUsers.findIndex(user => user.username === username) + 1 : null;
    
    console.log(`User ${username} status: ${isWaiting ? `waiting at position ${userPosition}/${matchingState.waitingUsers.length}` : 'not waiting'}`);
    console.log(`----- END MATCH STATUS CHECK -----`);
    
    return NextResponse.json({
      status: isWaiting ? 'waiting' : 'not_waiting',
      position: userPosition,
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