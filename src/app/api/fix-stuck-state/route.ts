import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';
import redis from '@/lib/redis';
import { LEFT_BEHIND_PREFIX } from '@/utils/redis/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, roomName } = body;
    
    if (!username) {
      return NextResponse.json(
        { error: 'Missing username' },
        { status: 400 }
      );
    }
    
    console.log(`Fixing stuck state for user: ${username}, room: ${roomName}`);
    
    // 1. Remove user from all queues
    const removedFromQueue = await hybridMatchingService.removeUserFromQueue(username);
    console.log(`Removed ${username} from queue: ${removedFromQueue}`);
    
    // 2. Clear any left-behind state
    const leftBehindKey = `${LEFT_BEHIND_PREFIX}${username}`;
    await redis.del(leftBehindKey);
    console.log(`Cleared left-behind state for ${username}`);
    
    // 3. If room is provided, clean up room state
    if (roomName) {
      try {
        await hybridMatchingService.cleanupRoom(roomName);
        console.log(`Cleaned up room: ${roomName}`);
      } catch (error) {
        console.error(`Error cleaning up room ${roomName}:`, error);
      }
    }
    
    // 4. Clean up any active matches involving this user
    const activeMatches = await redis.hgetall('matching:active');
    for (const [matchRoomName, matchData] of Object.entries(activeMatches)) {
      try {
        const match = JSON.parse(matchData as string);
        if (match.user1 === username || match.user2 === username) {
          await redis.hdel('matching:active', matchRoomName);
          console.log(`Removed active match for room ${matchRoomName} involving ${username}`);
        }
      } catch (e) {
        console.error('Error parsing match data:', e);
      }
    }
    
    // 5. Clean up room occupancy tracking
    try {
      await redis.hdel('room_occupancy', roomName || '');
      await redis.hdel('user_room_mapping', username);
      console.log(`Cleaned up room occupancy tracking for ${username}`);
    } catch (error) {
      console.error('Error cleaning up room occupancy:', error);
    }
    
    // 6. Trigger cleanup and sync
    await hybridMatchingService.cleanupOldWaitingUsers();
    await hybridMatchingService.cleanupOldMatches();
    
    return NextResponse.json({
      success: true,
      message: `Successfully fixed stuck state for ${username}`,
      actions: [
        'Removed from queue',
        'Cleared left-behind state', 
        'Cleaned up room state',
        'Removed active matches',
        'Cleaned up room occupancy',
        'Triggered system cleanup'
      ]
    });
    
  } catch (error) {
    console.error('Error fixing stuck state:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
} 