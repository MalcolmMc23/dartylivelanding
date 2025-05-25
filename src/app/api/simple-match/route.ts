import { NextRequest, NextResponse } from 'next/server';
import * as simpleMatchingService from '@/utils/redis/simpleMatchingService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, username, useDemo = false, roomName } = body;
    
    if (!username) {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 });
    }
    
    console.log(`Simple match API: ${action} for ${username}`);
    
    switch (action) {
      case 'find_match':
        // User wants to find a match
        const matchResult = await simpleMatchingService.findMatch(username, useDemo);
        return NextResponse.json(matchResult);
        
      case 'skip':
        // User clicked SKIP button
        if (!roomName) {
          return NextResponse.json({ error: 'Missing roomName for skip' }, { status: 400 });
        }
        const skipResult = await simpleMatchingService.handleSkip(username, roomName);
        return NextResponse.json(skipResult);
        
      case 'end_call':
        // User clicked END button
        if (!roomName) {
          return NextResponse.json({ error: 'Missing roomName for end_call' }, { status: 400 });
        }
        const endResult = await simpleMatchingService.handleEndCall(username, roomName);
        return NextResponse.json(endResult);
        
      case 'disconnected':
        // User disconnected unexpectedly
        if (!roomName) {
          return NextResponse.json({ error: 'Missing roomName for disconnected' }, { status: 400 });
        }
        const disconnectResult = await simpleMatchingService.handleDisconnection(username, roomName);
        return NextResponse.json(disconnectResult);
        
      case 'cancel':
        // User wants to cancel and leave queue
        const cancelResult = await simpleMatchingService.cancelUser(username);
        return NextResponse.json(cancelResult);
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Error in simple-match API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    
    if (!username) {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 });
    }
    
    // Get user's current status
    const status = await simpleMatchingService.getUserStatus(username);
    return NextResponse.json(status);
    
  } catch (error) {
    console.error('Error getting user status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 