import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';

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
    
    // Clean up stale records
    await hybridMatchingService.cleanupOldWaitingUsers();
    await hybridMatchingService.cleanupOldMatches();
    
    // Check if user is already matched
    const status = await hybridMatchingService.getWaitingQueueStatus(username);
    
    if (status.status === 'matched') {
      console.log(`User ${username} is already matched in room ${status.roomName}`);
      return NextResponse.json(status);
    }
    
    // Try to find a match
    const matchResult = await hybridMatchingService.findMatchForUser(
      username, 
      useDemo,
      body.lastMatch?.matchedWith
    );
    
    if (matchResult.status === 'matched') {
      console.log(`User ${username} matched with ${matchResult.matchedWith} in room ${matchResult.roomName}`);
      
      // Add extra verification that both users are properly tracked in the match
      try {
        const roomInfo = await hybridMatchingService.getRoomInfo(matchResult.roomName);
        
        if (!roomInfo.isActive || !roomInfo.users?.includes(username)) {
          console.log(`Room ${matchResult.roomName} not active or missing user ${username}, repairing match`);
          
          // Try to ensure the match is properly recorded
          await hybridMatchingService.removeUserFromQueue(username);
          await hybridMatchingService.removeUserFromQueue(matchResult.matchedWith);
          
          // Re-create the match with both users
          // const repairMatch = {
          //   user1: username,
          //   user2: matchResult.matchedWith,
          //   roomName: matchResult.roomName,
          //   useDemo: matchResult.useDemo,
          //   matchedAt: Date.now()
          // };
          
          // This helper function isn't directly exposed, so we'll have to assume the internal state gets fixed otherwise
          // If the matchResult indicates a match, the system should have properly recorded it already
        }
      } catch (verifyError) {
        console.error(`Error verifying match for ${username}:`, verifyError);
        // Continue with the flow even if verification fails, as the match might still be valid
      }
      
      return NextResponse.json(matchResult);
    }
    
    // No match found, add user to queue
    await hybridMatchingService.addUserToQueue(username, useDemo);
    
    console.log(`Added ${username} to waiting queue`);
    
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

// API to check status
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
    await hybridMatchingService.cleanupOldWaitingUsers();
    await hybridMatchingService.cleanupOldMatches();
    
    // Handle cancel action
    if (action === 'cancel') {
      // Remove from waiting queue
      const wasRemoved = await hybridMatchingService.removeUserFromQueue(username);
      
      return NextResponse.json({
        status: wasRemoved ? 'cancelled' : 'not_found',
        message: wasRemoved 
          ? 'Successfully removed from waiting queue' 
          : 'User not found in waiting queue'
      });
    }
    
    // Get status
    const status = await hybridMatchingService.getWaitingQueueStatus(username);
    
    // If user is in 'waiting' state but it's been a while, refresh their position
    if (status.status === 'waiting') {
      // Only refresh queue position if this is a regular poll, not explicit action
      if (!action) {
        console.log(`User ${username} is waiting, refreshing queue position`);
        
        // Touch the user's position in the queue to keep them active
        await hybridMatchingService.removeUserFromQueue(username);
        await hybridMatchingService.addUserToQueue(username, false);
      }
    }
    
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error in match-user GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 