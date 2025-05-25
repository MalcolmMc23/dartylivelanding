import { syncAllRoomsWithLiveKit, cleanupStaleRooms } from './roomSyncManager';

// Sync service configuration
const SYNC_INTERVAL = 30000; // 30 seconds
const CLEANUP_INTERVAL = 300000; // 5 minutes

let syncInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start the periodic sync service
 */
export function startSyncService() {
  if (isRunning) {
    console.log('Sync service is already running');
    return;
  }

  console.log('Starting LiveKit-Redis sync service');
  isRunning = true;

  // Periodic room synchronization
  syncInterval = setInterval(async () => {
    try {
      const result = await syncAllRoomsWithLiveKit();
      if (result.synced > 0 || result.cleaned > 0 || result.errors > 0) {
        console.log(`Sync completed: ${result.synced} synced, ${result.cleaned} cleaned, ${result.errors} errors`);
      }
    } catch (error) {
      console.error('Error during periodic sync:', error);
    }
  }, SYNC_INTERVAL);

  // Periodic cleanup
  cleanupInterval = setInterval(async () => {
    try {
      const cleaned = await cleanupStaleRooms();
      if (cleaned > 0) {
        console.log(`Cleanup completed: ${cleaned} stale rooms removed`);
      }
    } catch (error) {
      console.error('Error during periodic cleanup:', error);
    }
  }, CLEANUP_INTERVAL);

  console.log(`Sync service started with ${SYNC_INTERVAL}ms sync interval and ${CLEANUP_INTERVAL}ms cleanup interval`);
}

/**
 * Stop the periodic sync service
 */
export function stopSyncService() {
  if (!isRunning) {
    console.log('Sync service is not running');
    return;
  }

  console.log('Stopping LiveKit-Redis sync service');
  
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  isRunning = false;
  console.log('Sync service stopped');
}

/**
 * Check if sync service is running
 */
export function isSyncServiceRunning(): boolean {
  return isRunning;
}

/**
 * Trigger immediate sync
 */
export async function triggerImmediateSync() {
  console.log('Triggering immediate sync');
  try {
    const result = await syncAllRoomsWithLiveKit();
    console.log(`Immediate sync completed: ${result.synced} synced, ${result.cleaned} cleaned, ${result.errors} errors`);
    return result;
  } catch (error) {
    console.error('Error during immediate sync:', error);
    throw error;
  }
}

// Auto-start the sync service in server environments
if (typeof window === 'undefined') {
  // Start with a delay to ensure Redis connection is ready
  setTimeout(() => {
    if (!isSyncServiceRunning()) {
      startSyncService();
    }
  }, 5000); // 5 second delay
} 