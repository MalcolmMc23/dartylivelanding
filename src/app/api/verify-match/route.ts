import { NextRequest, NextResponse } from 'next/server';
import { verifyUserRoomAccess, ensureMatchReady } from '@/utils/redis/roomVerificationService';

export async function POST(request: NextRequest) {
  try {
    const { username, roomName } = await request.json();
    
    if (!username || !roomName) {
      return NextResponse.json(
        { error: 'Missing username or roomName' },
        { status: 400 }
      );
    }

    // Verify user has access to this room
    const roomAccess = await verifyUserRoomAccess(username, roomName);
    
    if (!roomAccess.authorized) {
      return NextResponse.json({
        verified: false,
        reason: roomAccess.reason
      });
    }

    // Ensure the match is ready
    const matchReady = await ensureMatchReady(roomName);
    
    if (!matchReady.ready) {
      return NextResponse.json({
        verified: false,
        reason: 'Match not ready'
      });
    }

    return NextResponse.json({
      verified: true,
      matchedWith: roomAccess.matchedWith,
      useDemo: roomAccess.useDemo,
      roomName
    });
    
  } catch (error) {
    console.error('Error verifying match:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 