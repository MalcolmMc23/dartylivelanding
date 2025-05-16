import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';
import redis from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();
    
    if (!username) {
      return NextResponse.json(
        { error: 'Missing username' },
        { status: 400 }
      );
    }
    
    console.log(`Canceling matches for user: ${username}`);
    
    // Remove user from the waiting queue
    const wasRemoved = await hybridMatchingService.removeUserFromQueue(username);
    
    // Also check if user is in an active match and clean that up too
    let matchesRemoved = 0;
    try {
      // Get all matches
      const allMatches = await redis.hgetall('matching:active');
      
      for (const [roomName, matchData] of Object.entries(allMatches)) {
        try {
          const match = JSON.parse(matchData as string);
          
          // If user is in this match, remove the match
          if (match.user1 === username || match.user2 === username) {
            console.log(`Found active match for ${username} in room ${roomName}, cleaning up`);
            
            // Get the other user in the match
            const otherUser = match.user1 === username ? match.user2 : match.user1;
            
            // Remove the match
            await redis.hdel('matching:active', roomName);
            matchesRemoved++;
            
            // Add the other user back to the waiting queue
            if (otherUser) {
              console.log(`Adding other user ${otherUser} back to waiting queue`);
              
              // Check if other user is already in a queue first
              const otherUserInQueue = await hybridMatchingService.getWaitingQueueStatus(otherUser);
              
              if (otherUserInQueue.status !== 'waiting' && otherUserInQueue.status !== 'in_call') {
                await hybridMatchingService.addUserToQueue(otherUser, match.useDemo, true);
              }
            }
          }
        } catch (e) {
          console.error(`Error processing match ${roomName}:`, e);
        }
      }
    } catch (matchError) {
      console.error('Error cleaning up active matches:', matchError);
    }
    
    // Release any locks that might be held
    try {
      await redis.del(`match_lock`);
      await redis.del(`match_lock:time`);
    } catch (lockError) {
      console.error('Error clearing locks:', lockError);
    }
    
    return NextResponse.json({
      status: wasRemoved || matchesRemoved > 0 ? 'cancelled' : 'not_found',
      message: wasRemoved 
        ? `Successfully removed from waiting queue and ${matchesRemoved} active matches` 
        : matchesRemoved > 0 
          ? `Removed from ${matchesRemoved} active matches` 
          : 'User not found in any queue or match'
    });
  } catch (error) {
    console.error('Error in cancel-match:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 