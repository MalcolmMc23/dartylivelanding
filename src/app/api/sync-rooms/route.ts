import { NextRequest, NextResponse } from 'next/server';
import { syncAllRooms, syncRoomState } from '@/utils/livekit-sync/roomSyncService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, roomName } = body;

    if (action === 'sync-all') {
      console.log('Triggering sync for all rooms');
      const result = await syncAllRooms();
      
      return NextResponse.json({
        success: true,
        message: 'Room synchronization completed',
        ...result,
        timestamp: Date.now()
      });
    }

    if (action === 'sync-room' && roomName) {
      console.log(`Triggering sync for room: ${roomName}`);
      const result = await syncRoomState(roomName);
      
      return NextResponse.json({
        success: true,
        message: `Room ${roomName} synchronization completed`,
        roomName,
        action: result.action,
        details: result.details,
        timestamp: Date.now()
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "sync-all" or "sync-room" with roomName' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error in room sync endpoint:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Room synchronization failed',
        details: String(error),
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomName = searchParams.get('roomName');

    if (roomName) {
      // Sync specific room
      const result = await syncRoomState(roomName);
      
      return NextResponse.json({
        success: true,
        roomName,
        action: result.action,
        details: result.details,
        timestamp: Date.now()
      });
    } else {
      // Sync all rooms
      const result = await syncAllRooms();
      
      return NextResponse.json({
        success: true,
        message: 'All rooms synchronized',
        ...result,
        timestamp: Date.now()
      });
    }

  } catch (error) {
    console.error('Error in room sync GET endpoint:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Room synchronization failed',
        details: String(error),
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
} 