import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';
import redis from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { username, useDemo = false, isRematching = false } = body;
    
    if (!username) {
      return NextResponse.json(
        { error: 'Missing username' },
        { status: 400 }
      );
    }
    
    console.log(`Match request for ${username} (useDemo: ${useDemo}, isRematching: ${isRematching})`);
    
    // Clean up stale records
    await hybridMatchingService.cleanupOldWaitingUsers();
    await hybridMatchingService.cleanupOldMatches();
    
    // Special handling for users who are being re-matched
    if (isRematching) {
      console.log(`User ${username} is being re-matched after being left alone`);
      
      // First ensure user is removed from any existing queues or matches
      await hybridMatchingService.removeUserFromQueue(username);
      
      // Try multiple aggressive match attempts for left-behind users
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        // Look for users already in the in-call queue first (priority matching)
        const matchResult = await hybridMatchingService.findMatchForUser(
          username, 
          useDemo,
          body.lastMatch?.matchedWith
        );
        
        if (matchResult.status === 'matched') {
          console.log(`Re-matched user ${username} with ${matchResult.matchedWith} in room ${matchResult.roomName} (attempt ${attempts + 1})`);
          return NextResponse.json(matchResult);
        }
        
        // Add a small delay between attempts
        if (attempts < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        attempts++;
      }
      
      console.log(`No immediate match found for ${username} after ${maxAttempts} attempts, adding to in-call queue for priority matching`);
      
      // Generate a new room name for this user
      await hybridMatchingService.addUserToQueue(
        username,
        useDemo,
        true, // inCall=true for priority matching
        undefined, // Let the service generate a room name
        body.lastMatch // Provide any previous match info
      );
      
      return NextResponse.json({
        status: 'waiting',
        message: 'Added to priority waiting queue',
        isPriority: true
      });
    }
    
    // Regular matching flow (non-rematch) continues below
    
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
    
    // After adding to the queue, try one more aggressive match attempt
    // This helps when two users click at almost the same time
    await new Promise(resolve => setTimeout(resolve, 500));
    const retryMatchResult = await hybridMatchingService.findMatchForUser(
      username, 
      useDemo,
      body.lastMatch?.matchedWith
    );

    if (retryMatchResult.status === 'matched') {
      console.log(`Retry match found! User ${username} matched with ${retryMatchResult.matchedWith} in room ${retryMatchResult.roomName}`);
      
      // Add extra verification for the retry match to ensure both users are properly matched
      try {
        const roomInfo = await hybridMatchingService.getRoomInfo(retryMatchResult.roomName);
        
        if (!roomInfo.isActive || !roomInfo.users?.includes(username) || !roomInfo.users?.includes(retryMatchResult.matchedWith)) {
          console.log(`Room ${retryMatchResult.roomName} has validation issues, attempting repair`);
          
          // Remove both users from any queues to ensure a clean slate
          await hybridMatchingService.removeUserFromQueue(username);
          await hybridMatchingService.removeUserFromQueue(retryMatchResult.matchedWith);
          
          // Recreate the match with a fresh room
          const newRoomName = `retry-${retryMatchResult.roomName}`;
          
          // Create match record directly
          const matchData = {
            user1: username,
            user2: retryMatchResult.matchedWith,
            roomName: newRoomName,
            useDemo: retryMatchResult.useDemo,
            matchedAt: Date.now()
          };
          
          // Create the match entry in Redis directly
          await redis.hset(
            'matching:active',
            newRoomName,
            JSON.stringify(matchData)
          );
          
          // This could be encapsulated in a new service method for better organization
          return NextResponse.json({
            status: 'matched',
            roomName: newRoomName,
            matchedWith: retryMatchResult.matchedWith,
            useDemo: retryMatchResult.useDemo,
            repaired: true
          });
        }
      } catch (verifyError) {
        console.error(`Error verifying retry match for ${username}:`, verifyError);
        // Continue with the original match result even if verification fails
      }
      
      return NextResponse.json(retryMatchResult);
    }

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
    
    // If user is in any queue (waiting or in-call), refresh their position
    if (status.status === 'waiting' || status.status === 'in_call') {
      // Only refresh queue position if this is a regular poll, not explicit action
      if (!action) {
        console.log(`User ${username} is in ${status.status} state, refreshing queue position`);
        
        // Remove and re-add to maintain the same queue state and room (if applicable)
        const wasRemoved = await hybridMatchingService.removeUserFromQueue(username);
        
        if (wasRemoved) {
          // Re-add with the same parameters to refresh timestamp
          const inCall = status.status === 'in_call';
          await hybridMatchingService.addUserToQueue(
            username, 
            status.useDemo || false, 
            inCall,
            status.roomName
          );
          console.log(`Refreshed queue position for ${username}, in-call: ${inCall}`);
        }
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