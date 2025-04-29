import { NextResponse } from 'next/server';
import { 
  matchingState, 
  cleanupOldWaitingUsers, 
  cleanupOldMatches,
  removeUserFromQueue,
  REMATCH_COOLDOWN
} from '@/utils/matchingService';

// This endpoint tries to find matches for users who have been waiting
// and whose cooldown period has expired
export async function GET() {
  try {
    // Clean up stale users and matches
    cleanupOldWaitingUsers();
    cleanupOldMatches();

    console.log(`----- RETRY MATCHES REQUEST -----`);
    console.log(`Current state: ${matchingState.waitingUsers.length} waiting, ${matchingState.matchedUsers.length} matched`);
    
    if (matchingState.waitingUsers.length < 2) {
      console.log(`Not enough users in queue to match: ${matchingState.waitingUsers.length}`);
      console.log(`----- END RETRY MATCHES REQUEST -----`);
      return NextResponse.json({
        status: 'no_action',
        message: 'Not enough users in the waiting queue to match'
      });
    }
    
    const now = Date.now();
    
    // Sort users by join time (oldest first)
    const sortedWaitingUsers = [...matchingState.waitingUsers].sort((a, b) => a.joinedAt - b.joinedAt);
    
    console.log(`Looking for potential matches among ${sortedWaitingUsers.length} users`);
    
    // Track successful matches
    const matchesMade = [];
    
    // Try to match each user with another eligible user
    for (let i = 0; i < sortedWaitingUsers.length; i++) {
      const user1 = sortedWaitingUsers[i];
      
      // Skip if this user has already been matched in this iteration
      if (!matchingState.waitingUsers.some(u => u.username === user1.username)) {
        continue;
      }
      
      console.log(`Checking potential matches for ${user1.username}`);
      
      for (let j = i + 1; j < sortedWaitingUsers.length; j++) {
        const user2 = sortedWaitingUsers[j];
        
        // Skip if this user has already been matched in this iteration
        if (!matchingState.waitingUsers.some(u => u.username === user2.username)) {
          continue;
        }
        
        // Check if these users were recently matched with each other
        const user1RecentlyMatched = user1.lastMatch !== undefined
          && user1.lastMatch.matchedWith === user2.username
          && (now - user1.lastMatch.timestamp) < REMATCH_COOLDOWN;
        
        const user2RecentlyMatched = user2.lastMatch !== undefined
          && user2.lastMatch.matchedWith === user1.username
          && (now - user2.lastMatch.timestamp) < REMATCH_COOLDOWN;
        
        // If neither user is in cooldown, we can match them
        if (!user1RecentlyMatched && !user2RecentlyMatched) {
          // Remove both users from the queue
          removeUserFromQueue(user1.username);
          removeUserFromQueue(user2.username);
          
          // Generate a unique room name
          const roomName = `match-${Math.random().toString(36).substring(2, 10)}`;
          
          // Determine which demo server setting to use (if either user has it enabled)
          const useDemo = user1.useDemo || user2.useDemo;
          
          // Create the match
          matchingState.matchedUsers.push({
            user1: user1.username,
            user2: user2.username,
            roomName,
            useDemo,
            matchedAt: now
          });
          
          console.log(`Matched ${user1.username} with ${user2.username} in room ${roomName}`);
          
          // Record this match
          matchesMade.push({
            user1: user1.username,
            user2: user2.username,
            roomName
          });
          
          // Move to the next unmatched user
          break;
        } else {
          // Log why we couldn't match these users
          if (user1RecentlyMatched && user1.lastMatch) {
            const timeSinceMatch = Math.floor((now - user1.lastMatch.timestamp) / 1000);
            console.log(`  Can't match: ${user1.username} recently matched with ${user2.username} (${timeSinceMatch}s ago, cooldown: ${REMATCH_COOLDOWN/1000}s)`);
          }
          if (user2RecentlyMatched && user2.lastMatch) {
            const timeSinceMatch = Math.floor((now - user2.lastMatch.timestamp) / 1000);
            console.log(`  Can't match: ${user2.username} recently matched with ${user1.username} (${timeSinceMatch}s ago, cooldown: ${REMATCH_COOLDOWN/1000}s)`);
          }
        }
      }
    }
    
    console.log(`Made ${matchesMade.length} new matches`);
    console.log(`Remaining in queue: ${matchingState.waitingUsers.length} users`);
    console.log(`Total active matches: ${matchingState.matchedUsers.length}`);
    console.log(`----- END RETRY MATCHES REQUEST -----`);
    
    return NextResponse.json({
      status: 'success',
      matchesMade,
      remainingInQueue: matchingState.waitingUsers.length
    });
  } catch (error) {
    console.error('Error in retry-matches:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 