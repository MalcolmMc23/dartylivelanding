import { NextRequest, NextResponse } from 'next/server';
import * as simpleMatchingService from '@/utils/redis/simpleMatchingService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, username, useDemo = false, roomName, otherUsername } = body;
    
    if (!username) {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 });
    }
    
    console.log(`Simple queue API: ${action} for ${username}`);
    
    switch (action) {
      case 'join':
        // User wants to find a match
        const matchResult = await simpleMatchingService.findMatch(username, useDemo);
        return NextResponse.json(matchResult);
        
      case 'skip':
        // User clicked SKIP button - both users go back to queue
        if (!otherUsername) {
          return NextResponse.json({ error: 'Missing otherUsername for skip' }, { status: 400 });
        }
        // Get roomName from user's current match
        const userStatus = await simpleMatchingService.getUserStatus(username);
        const currentRoomName = roomName || userStatus.roomName;
        
        if (!currentRoomName) {
          return NextResponse.json({ error: 'No active room found for skip' }, { status: 400 });
        }
        
        const skipResult = await simpleMatchingService.handleSkip(username, currentRoomName);
        return NextResponse.json(skipResult);
        
      case 'leave':
        // User clicked LEAVE button - user leaves, other goes to queue
        if (!otherUsername) {
          return NextResponse.json({ error: 'Missing otherUsername for leave' }, { status: 400 });
        }
        // Get roomName from user's current match
        const leaveUserStatus = await simpleMatchingService.getUserStatus(username);
        const leaveRoomName = roomName || leaveUserStatus.roomName;
        
        if (!leaveRoomName) {
          return NextResponse.json({ error: 'No active room found for leave' }, { status: 400 });
        }
        
        const endResult = await simpleMatchingService.handleEndCall(username, leaveRoomName);
        return NextResponse.json({ ...endResult, status: 'left' });
        
      case 'remove':
        // User wants to cancel and leave queue
        const cancelResult = await simpleMatchingService.cancelUser(username);
        return NextResponse.json(cancelResult);
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Error in simple-queue API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const username = searchParams.get('username');
    
    if (action === 'stats') {
      // Get queue statistics
      const stats = await simpleMatchingService.getQueueStats();
      return NextResponse.json(stats);
    }
    
    if (action === 'status' && username) {
      // Get user's current status
      const status = await simpleMatchingService.getUserStatus(username);
      return NextResponse.json({ user: status });
    }
    
    return NextResponse.json({ error: 'Invalid action or missing parameters' }, { status: 400 });
    
  } catch (error) {
    console.error('Error in simple-queue GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 