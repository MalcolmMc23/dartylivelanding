import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';
import redis from '@/lib/redis';
import { LEFT_BEHIND_PREFIX } from '@/utils/redis/constants';

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
    await hybridMatchingService.cleanupOldMatches();
    
    // Check if user is already matched
    const status = await hybridMatchingService.getWaitingQueueStatus(username);
    
    if (status.status === 'matched') {
      console.log(`User ${username} is already matched in room ${status.roomName}`);
      
      // Confirm the match state for consistency
      if (status.roomName && status.matchedWith) {
        try {
          await hybridMatchingService.confirmUserRematch(username, status.roomName, status.matchedWith);
        } catch (e) {
          console.error(`Error confirming rematch for already matched user ${username}:`, e);
        }
      }
      return NextResponse.json(status);
    }
    
    // Special handling for rematching users (simplified)
    if (isRematching) {
      console.log(`User ${username} is being re-matched after being left alone`);
      
      // Check for left-behind state
      const leftBehindKey = `${LEFT_BEHIND_PREFIX}${username}`;
      const leftBehindData = await redis.get(leftBehindKey);
      let roomNameFromLeftBehind = undefined;
      
      if (leftBehindData) {
        try {
          const leftBehindState = JSON.parse(leftBehindData);
          roomNameFromLeftBehind = leftBehindState.newRoomName;
          console.log(`Found left-behind state for ${username}: inQueue=${leftBehindState.inQueue}, processed=${leftBehindState.processed}`);
        } catch (e) {
          console.error(`Error parsing left-behind state for ${username}:`, e);
        }
      } else {
        console.log(`No left-behind state found for ${username}, will create new queue entry`);
      }
      
      // Remove from any existing queues first
      await hybridMatchingService.removeUserFromQueue(username);
      
      // Try to find a match immediately
      const matchResult = await hybridMatchingService.findMatchForUser(
        username, 
        useDemo,
        body.lastMatch?.matchedWith
      );
      
      if (matchResult.status === 'matched' && 'roomName' in matchResult && 'matchedWith' in matchResult) {
        console.log(`Re-matched user ${username} with ${matchResult.matchedWith} in room ${matchResult.roomName}`);
        await hybridMatchingService.confirmUserRematch(username, matchResult.roomName, matchResult.matchedWith);
        return NextResponse.json(matchResult);
      }
      
      // If no immediate match, add to high-priority queue
      console.log(`No immediate match found for ${username}, adding to high-priority queue`);
      
      await hybridMatchingService.addUserToQueue(
        username,
        useDemo,
        'in_call', // High priority for rematching users
        roomNameFromLeftBehind,
        body.lastMatch
      );
      
      // Trigger additional queue processing for rematching users
      setTimeout(async () => {
        try {
          console.log(`Triggering extra queue processing for rematching user ${username}`);
          await hybridMatchingService.triggerImmediateProcessing();
        } catch (error) {
          console.error('Error triggering extra queue processing for rematch:', error);
        }
      }, 500); // Wait 500ms then trigger processing
      
      return NextResponse.json({
        status: 'waiting',
        message: 'Added to priority waiting queue',
        isPriority: true,
        roomName: roomNameFromLeftBehind
      });
    }
    
    // Regular matching flow for new users
    const matchResult = await hybridMatchingService.findMatchForUser(
      username, 
      useDemo,
      body.lastMatch?.matchedWith
    );
    
    if (matchResult.status === 'matched' && 'roomName' in matchResult && 'matchedWith' in matchResult) {
      console.log(`User ${username} matched with ${matchResult.matchedWith} in room ${matchResult.roomName}`);
      
      // Update any left_behind state when a match is found
      await hybridMatchingService.confirmUserRematch(username, matchResult.roomName, matchResult.matchedWith);
      
      return NextResponse.json(matchResult);
    }
    
    // No match found, add user to waiting queue
    await hybridMatchingService.addUserToQueue(username, useDemo, 'waiting');
    
    console.log(`Added ${username} to waiting queue`);
    
    // For regular users who don't find immediate matches, also trigger queue processing
    setTimeout(async () => {
      try {
        console.log(`Triggering queue processing for new user ${username} who didn't find immediate match`);
        await hybridMatchingService.triggerImmediateProcessing();
      } catch (error) {
        console.error('Error triggering queue processing for new user:', error);
      }
    }, 1000); // Wait 1 second then trigger processing to give other users time to join
    
    return NextResponse.json({
      status: 'waiting',
      message: 'Added to waiting queue'
    });
    
  } catch (error) {
    console.error('Error in match-user POST:', error);
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
    await hybridMatchingService.cleanupOldMatches();
    
    // Handle cancel action
    if (action === 'cancel') {
      // Remove from waiting queue
      const wasRemoved = await hybridMatchingService.removeUserFromQueue(username);
      
      // Also attempt to clear any 'left_behind' status if user cancels
      try {
        await redis.del(`left_behind:${username}`);
        console.log(`Cleared left_behind state for ${username} due to cancel action`);
      } catch (e) {
        console.error(`Error clearing left_behind state for ${username} on cancel:`, e);
      }
      
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