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
      return NextResponse.json(status);
    }
    
    // Try to find a match
    const matchResult = await hybridMatchingService.findMatchForUser(
      username, 
      useDemo,
      body.lastMatch?.matchedWith
    );
    
    if (matchResult.status === 'matched') {
      return NextResponse.json(matchResult);
    }
    
    // No match found, add user to queue
    await hybridMatchingService.addUserToQueue(username, useDemo);
    
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
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error in match-user GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 