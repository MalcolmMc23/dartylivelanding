import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    // Check if user should be force disconnected
    const forceDisconnect = await redis.get(`force-disconnect:${userId}`);
    
    if (forceDisconnect) {
      // Clear the flag
      await redis.del(`force-disconnect:${userId}`);
      
      return NextResponse.json({
        success: true,
        shouldDisconnect: true
      });
    }
    
    return NextResponse.json({
      success: true,
      shouldDisconnect: false
    });
  } catch (error) {
    console.error('Error checking disconnect:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}