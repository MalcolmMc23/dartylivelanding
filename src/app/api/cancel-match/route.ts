import { NextRequest, NextResponse } from 'next/server';
import { 
  matchingState, 
  removeUserFromQueue,
  cleanupOldWaitingUsers,
  cleanupOldMatches
} from '@/utils/matchingService';

interface CancellationResult {
  status: string;
  otherUser?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { username } = body;
    
    if (!username) {
      return NextResponse.json(
        { error: 'Missing username' },
        { status: 400 }
      );
    }
    
    console.log(`Request to cancel matching for user: ${username}`);
    
    // Clean up stale users and matches first
    cleanupOldWaitingUsers();
    cleanupOldMatches();
    
    // First, check if this user is in the waiting queue
    const isInWaitingQueue = matchingState.waitingUsers.some(
      user => user.username === username
    );
    
    // Also check if the user is in a match
    const matchIndex = matchingState.matchedUsers.findIndex(
      match => match.user1 === username || match.user2 === username
    );
    
    let result: CancellationResult = { status: 'no_action' };
    
    // Remove user from waiting queue if they're in it
    if (isInWaitingQueue) {
      removeUserFromQueue(username);
      result = { ...result, status: 'removed_from_queue' };
      console.log(`Removed ${username} from waiting queue`);
    }
    
    // If user is in a match, handle that as well
    if (matchIndex >= 0) {
      const match = matchingState.matchedUsers[matchIndex];
      const otherUsername = match.user1 === username ? match.user2 : match.user1;
      
      // Remove the match
      matchingState.matchedUsers.splice(matchIndex, 1);
      console.log(`Removed match between ${username} and ${otherUsername}`);
      
      // Add the other user back to the queue with inCall=true if appropriate
      // This would happen if they were in an active call
      result = { 
        ...result, 
        status: 'match_canceled',
        otherUser: otherUsername
      };
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in cancel-match:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 