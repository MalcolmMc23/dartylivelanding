import { NextRequest, NextResponse } from 'next/server';
import { 
  triggerImmediateSync, 
  isSyncServiceRunning, 
  startSyncService, 
  stopSyncService 
} from '@/utils/redis/syncService';
import { syncAllRoomsWithLiveKit, cleanupStaleRooms } from '@/utils/redis/roomSyncManager';

export async function GET() {
  try {
    // Return sync service status
    return NextResponse.json({
      syncServiceRunning: isSyncServiceRunning(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'sync':
        // Trigger immediate sync
        const syncResult = await triggerImmediateSync();
        return NextResponse.json({
          action: 'sync',
          result: syncResult,
          timestamp: new Date().toISOString()
        });

      case 'cleanup':
        // Trigger immediate cleanup
        const cleanupResult = await cleanupStaleRooms();
        return NextResponse.json({
          action: 'cleanup',
          cleaned: cleanupResult,
          timestamp: new Date().toISOString()
        });

      case 'full-sync':
        // Trigger both sync and cleanup
        const fullSyncResult = await syncAllRoomsWithLiveKit();
        const fullCleanupResult = await cleanupStaleRooms();
        return NextResponse.json({
          action: 'full-sync',
          sync: fullSyncResult,
          cleanup: fullCleanupResult,
          timestamp: new Date().toISOString()
        });

      case 'start-service':
        // Start the sync service
        startSyncService();
        return NextResponse.json({
          action: 'start-service',
          running: isSyncServiceRunning(),
          timestamp: new Date().toISOString()
        });

      case 'stop-service':
        // Stop the sync service
        stopSyncService();
        return NextResponse.json({
          action: 'stop-service',
          running: isSyncServiceRunning(),
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: sync, cleanup, full-sync, start-service, or stop-service' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error processing sync request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 