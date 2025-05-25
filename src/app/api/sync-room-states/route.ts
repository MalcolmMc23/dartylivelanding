import { NextResponse } from 'next/server';
import { syncRoomAndQueueStates, getUsersAloneInRooms } from '@/utils/redis/roomStateManager';

export async function POST() {
  try {
    console.log('Manual room and queue state synchronization triggered');
    
    // Get users alone in rooms before sync
    const usersAloneBefore = await getUsersAloneInRooms();
    
    // Perform synchronization
    const syncResult = await syncRoomAndQueueStates();
    
    // Get users alone in rooms after sync
    const usersAloneAfter = await getUsersAloneInRooms();
    
    return NextResponse.json({
      success: true,
      syncResult,
      usersAloneBefore,
      usersAloneAfter,
      timestamp: new Date().toISOString(),
      message: 'Room and queue state synchronization completed'
    });
  } catch (error) {
    console.error('Error during manual sync:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Just get current state without syncing
    const usersAloneInRooms = await getUsersAloneInRooms();
    
    return NextResponse.json({
      success: true,
      usersAloneInRooms,
      timestamp: new Date().toISOString(),
      message: 'Current room state retrieved'
    });
  } catch (error) {
    console.error('Error getting room state:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: String(error)
      },
      { status: 500 }
    );
  }
} 