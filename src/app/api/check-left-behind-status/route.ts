import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const username = searchParams.get('username');
  
  if (!username) {
    return NextResponse.json(
      { error: 'Missing username parameter' },
      { status: 400 }
    );
  }
  
  try {
    // Check if this user has a left-behind record
    const leftBehindData = await redis.get(`left_behind:${username}`);
    
    if (!leftBehindData) {
      return NextResponse.json({
        status: 'not_left_behind'
      });
    }
    
    // Parse the data
    const leftBehindState = JSON.parse(leftBehindData);
    
    // If they were already matched, return that info
    if (leftBehindState.processed && leftBehindState.matchedWith) {
      return NextResponse.json({
        status: 'already_matched',
        matchedWith: leftBehindState.matchedWith,
        roomName: leftBehindState.matchRoom,
        timestamp: leftBehindState.timestamp
      });
    }
    
    // Return their left-behind state
    return NextResponse.json({
      status: 'left_behind',
      previousRoom: leftBehindState.previousRoom,
      disconnectedFrom: leftBehindState.disconnectedFrom,
      newRoomName: leftBehindState.newRoomName,
      timestamp: leftBehindState.timestamp,
      inQueue: leftBehindState.inQueue
    });
  } catch (error) {
    console.error('Error checking left-behind status:', error);
    return NextResponse.json(
      { error: 'Server error checking left-behind status' },
      { status: 500 }
    );
  }
} 