import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';

// Check if a user has been matched while waiting
export async function POST(request: NextRequest) {
  try {
    const { username, roomName } = await request.json();
    
    console.log(`Checking match status for ${username} in room ${roomName}`);
    
    if (!username || !roomName) {
      return NextResponse.json(
        { error: 'Missing username or roomName' },
        { status: 400 }
      );
    }
    
    // Check the user's queue status
    const queueStatus = await hybridMatchingService.getWaitingQueueStatus(username);
    
    if (!queueStatus) {
      return NextResponse.json({
        status: 'not_in_queue',
        timestamp: Date.now()
      });
    }
    
    // Check if they have a room assignment (indicating a match)
    if (queueStatus.roomName && queueStatus.roomName !== roomName) {
      // They've been assigned to a new room - this means they have a match
      return NextResponse.json({
        status: 'matched',
        newRoomName: queueStatus.roomName,
        matchedWith: 'matchedWith' in queueStatus ? queueStatus.matchedWith : 'unknown',
        timestamp: Date.now()
      });
    }
    
    // Still waiting
    return NextResponse.json({
      status: 'waiting',
      queuePosition: 'position' in queueStatus ? queueStatus.position : 'unknown',
      waitTime: 'joinedAt' in queueStatus && queueStatus.joinedAt ? Date.now() - new Date(queueStatus.joinedAt).getTime() : 0,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error checking match status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 