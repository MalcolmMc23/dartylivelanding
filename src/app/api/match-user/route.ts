import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';

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
      
      // Look for users already in the in-call queue first (priority matching)
      const matchResult = await hybridMatchingService.findMatchForUser(
        username, 
        useDemo,
        body.lastMatch?.matchedWith
      );
      
      if (matchResult.status === 'matched') {
        console.log(`Re-matched user ${username} with ${matchResult.matchedWith} in room ${matchResult.roomName}`);
        return NextResponse.json(matchResult);
      }
      
      // If no match found, add to queue with priority
      console.log(`No immediate match found for ${username}, adding to in-call queue for priority matching`);
      
      // Generate a new room name for this user
      // const roomInfo = await hybridMatchingService.addUserToQueue(
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