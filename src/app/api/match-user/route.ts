import { NextRequest, NextResponse } from 'next/server';

// In-memory waiting users queue
// In production, you would use a database or Redis
interface WaitingUser {
  username: string;
  joinedAt: number;
  useDemo: boolean;
}

interface MatchedPair {
  user1: string;
  user2: string;
  roomName: string;
  useDemo: boolean;
  matchedAt: number;
}

let waitingUsers: WaitingUser[] = [];
let matchedUsers: MatchedPair[] = [];

// Maximum time a user can wait before being removed from queue (5 minutes in ms)
const MAX_WAIT_TIME = 5 * 60 * 1000; 
// Maximum time to keep matched users in memory (10 minutes in ms)
const MAX_MATCH_TIME = 10 * 60 * 1000;

// Clean up waiting users who have been waiting too long
function cleanupOldWaitingUsers() {
  const now = Date.now();
  const initialLength = waitingUsers.length;
  
  waitingUsers = waitingUsers.filter(user => {
    return (now - user.joinedAt) < MAX_WAIT_TIME;
  });
  
  if (initialLength !== waitingUsers.length) {
    console.log(`Cleaned up ${initialLength - waitingUsers.length} stale users from waiting queue`);
  }
}

// Clean up matched pairs that are too old
function cleanupOldMatches() {
  const now = Date.now();
  const initialLength = matchedUsers.length;
  
  matchedUsers = matchedUsers.filter(match => {
    return (now - match.matchedAt) < MAX_MATCH_TIME;
  });
  
  if (initialLength !== matchedUsers.length) {
    console.log(`Cleaned up ${initialLength - matchedUsers.length} stale matched pairs`);
  }
}

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
    const existingMatch = matchedUsers.find(
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
    const existingUserIndex = waitingUsers.findIndex(
      user => user.username === username
    );
    
    if (existingUserIndex >= 0) {
      // Update this user's timestamp to keep them in the queue
      waitingUsers[existingUserIndex].joinedAt = Date.now();
      
      return NextResponse.json({
        status: 'waiting',
        message: 'You are still in the waiting queue'
      });
    }
    
    // Check if there are any other users waiting
    if (waitingUsers.length > 0) {
      // Match with the first user in the queue (FIFO)
      const matchedUser = waitingUsers.shift();
      
      if (!matchedUser) {
        // This shouldn't happen, but handle it just in case
        return NextResponse.json({
          status: 'error',
          error: 'Failed to match with waiting user'
        }, { status: 500 });
      }
      
      // Generate a unique room name for these two users
      const roomName = `match-${Math.random().toString(36).substring(2, 10)}`;
      
      console.log(`Matched users: ${username} and ${matchedUser.username} in room ${roomName}`);
      
      // Use the demo server setting from the first user if it was enabled
      const finalUseDemo = useDemo || matchedUser.useDemo;
      
      // Store the match
      matchedUsers.push({
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
    
    // No one waiting yet, add this user to the queue
    waitingUsers.push({
      username,
      joinedAt: Date.now(),
      useDemo
    });
    
    console.log(`Added ${username} to waiting queue. Current queue size: ${waitingUsers.length}`);
    
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
    const existingMatch = matchedUsers.find(
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
      const initialLength = waitingUsers.length;
      waitingUsers = waitingUsers.filter(user => user.username !== username);
      
      // Also remove any matches
      const initialMatchLength = matchedUsers.length;
      matchedUsers = matchedUsers.filter(match => 
        match.user1 !== username && match.user2 !== username
      );
      
      const wasRemoved = initialLength > waitingUsers.length || initialMatchLength > matchedUsers.length;
      
      return NextResponse.json({
        status: wasRemoved ? 'cancelled' : 'not_found',
        message: wasRemoved 
          ? 'Successfully removed from waiting/match queue' 
          : 'User not found in waiting queue'
      });
    }
    
    // Check status
    const isWaiting = waitingUsers.some(user => user.username === username);
    
    return NextResponse.json({
      status: isWaiting ? 'waiting' : 'not_waiting',
      position: isWaiting 
        ? waitingUsers.findIndex(user => user.username === username) + 1 
        : null,
      queueSize: waitingUsers.length
    });
  } catch (error) {
    console.error('Error in match-user GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 