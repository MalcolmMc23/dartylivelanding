import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request) {
  try {
    const { roomName, userId } = await request.json();

    if (!roomName || !userId) {
      return NextResponse.json(
        { success: false, error: 'Room name and user ID required' },
        { status: 400 }
      );
    }

    // Check if room was deleted
    const roomDeleted = await redis.get(`room-deleted:${roomName}`);
    
    // Also check user's skip status
    const [skipInProgress, forceDisconnect] = await Promise.all([
      redis.get(`skip-in-progress:${userId}`),
      redis.get(`force-disconnect:${userId}`)
    ]);
    
    const isValid = !roomDeleted && !skipInProgress && !forceDisconnect;
    
    return NextResponse.json({
      success: true,
      valid: isValid,
      reason: roomDeleted ? 'room-deleted' : 
              skipInProgress ? 'skip-in-progress' : 
              forceDisconnect ? 'force-disconnect' : null
    });
  } catch (error) {
    console.error('Error checking room validity:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}