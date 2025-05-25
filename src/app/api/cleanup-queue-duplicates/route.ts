import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { MATCHING_QUEUE } from '@/utils/redis/constants';
import { UserDataInQueue } from '@/utils/redis/types';

export async function POST() {
  try {
    console.log('Starting manual cleanup of queue duplicates');
    
    // Get all users from queue
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
    const seenUsers = new Map<string, UserDataInQueue>();
    const duplicatesToRemove: string[] = [];
    const invalidToRemove: string[] = [];
    
    console.log(`Found ${allQueuedUsersRaw.length} total entries in queue`);
    
    for (const userData of allQueuedUsersRaw) {
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        
        if (!user.username || typeof user.username !== 'string') {
          console.log('Found invalid entry with no username:', userData);
          invalidToRemove.push(userData);
          continue;
        }
        
        if (seenUsers.has(user.username)) {
          const existing = seenUsers.get(user.username)!;
          console.log(`Found duplicate for ${user.username}: existing(${existing.state}) vs new(${user.state})`);
          
          // Keep the one with higher priority (in_call > waiting)
          if (user.state === 'in_call' && existing.state === 'waiting') {
            // Remove the existing waiting entry, keep the in_call one
            const existingData = JSON.stringify(existing);
            duplicatesToRemove.push(existingData);
            seenUsers.set(user.username, user);
            console.log(`Keeping in_call entry for ${user.username}, removing waiting entry`);
          } else {
            // Remove this duplicate entry
            duplicatesToRemove.push(userData);
            console.log(`Removing duplicate entry for ${user.username}`);
          }
        } else {
          seenUsers.set(user.username, user);
        }
      } catch {
        console.log('Found invalid JSON entry:', userData);
        invalidToRemove.push(userData);
      }
    }
    
    // Remove all duplicates and invalid entries
    const allToRemove = [...duplicatesToRemove, ...invalidToRemove];
    
    for (const entry of allToRemove) {
      await redis.zrem(MATCHING_QUEUE, entry);
    }
    
    console.log(`Cleanup completed: removed ${duplicatesToRemove.length} duplicates and ${invalidToRemove.length} invalid entries`);
    
    // Get final count
    const finalCount = await redis.zcard(MATCHING_QUEUE);
    
    return NextResponse.json({
      success: true,
      initialCount: allQueuedUsersRaw.length,
      duplicatesRemoved: duplicatesToRemove.length,
      invalidRemoved: invalidToRemove.length,
      finalCount,
      uniqueUsers: seenUsers.size,
      message: `Cleaned up ${allToRemove.length} problematic entries. Queue now has ${finalCount} entries for ${seenUsers.size} unique users.`
    });
    
  } catch (error) {
    console.error('Error during queue cleanup:', error);
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
    // Just analyze the queue without cleaning
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
    const seenUsers = new Map<string, number>();
    const duplicates: string[] = [];
    const invalid: string[] = [];
    
    for (const userData of allQueuedUsersRaw) {
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        
        if (!user.username || typeof user.username !== 'string') {
          invalid.push(userData);
          continue;
        }
        
        const count = seenUsers.get(user.username) || 0;
        seenUsers.set(user.username, count + 1);
        
        if (count > 0) {
          duplicates.push(user.username);
        }
      } catch {
        invalid.push(userData);
      }
    }
    
    const duplicateUsers = Array.from(seenUsers.entries())
      .filter(([, count]) => count > 1)
      .map(([username, count]) => ({ username, count }));
    
    return NextResponse.json({
      success: true,
      totalEntries: allQueuedUsersRaw.length,
      uniqueUsers: seenUsers.size,
      duplicateUsers,
      invalidEntries: invalid.length,
      needsCleanup: duplicateUsers.length > 0 || invalid.length > 0
    });
    
  } catch (error) {
    console.error('Error analyzing queue:', error);
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