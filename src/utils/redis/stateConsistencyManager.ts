import redis from '../../lib/redis';
import { ACTIVE_MATCHES, MATCHING_QUEUE } from './constants';
import { UserDataInQueue, ActiveMatch } from './types';
// import { removeUserFromQueue } from './queueManager';
import { cleanupExpiredLeftBehindStates } from './leftBehindUserHandler';
import { syncRoomAndQueueStates } from './roomStateManager';

const STATE_CONSISTENCY_LOCK = 'state_consistency_lock';
const LOCK_EXPIRY = 30; // 30 seconds

let consistencyCheckInterval: NodeJS.Timeout | null = null;

export interface ConsistencyCheckResult {
  timestamp: number;
  checksPerformed: string[];
  issues: string[];
  fixes: string[];
  stats: {
    usersInQueue: number;
    activeMatches: number;
    leftBehindStatesCleanedUp: number;
    duplicateQueueEntriesRemoved: number;
    orphanedMatchesRemoved: number;
  };
}

/**
 * Run a comprehensive consistency check on the system state
 */
export async function runConsistencyCheck(): Promise<ConsistencyCheckResult> {
  const lockId = `consistency-${Date.now()}`;
  const result: ConsistencyCheckResult = {
    timestamp: Date.now(),
    checksPerformed: [],
    issues: [],
    fixes: [],
    stats: {
      usersInQueue: 0,
      activeMatches: 0,
      leftBehindStatesCleanedUp: 0,
      duplicateQueueEntriesRemoved: 0,
      orphanedMatchesRemoved: 0
    }
  };
  
  try {
    // Try to acquire lock to prevent concurrent consistency checks
    const lockAcquired = await redis.set(STATE_CONSISTENCY_LOCK, lockId, 'EX', LOCK_EXPIRY, 'NX');
    if (lockAcquired !== 'OK') {
      console.log('Another consistency check is already running');
      return result;
    }
    
    console.log('Starting state consistency check...');
    
    // 1. Clean up expired left-behind states
    result.checksPerformed.push('Clean up expired left-behind states');
    const leftBehindCleaned = await cleanupExpiredLeftBehindStates();
    result.stats.leftBehindStatesCleanedUp = leftBehindCleaned;
    if (leftBehindCleaned > 0) {
      result.fixes.push(`Cleaned up ${leftBehindCleaned} expired left-behind states`);
    }
    
    // 2. Check for and remove duplicate queue entries
    result.checksPerformed.push('Check for duplicate queue entries');
    const duplicatesRemoved = await removeDuplicateQueueEntries();
    result.stats.duplicateQueueEntriesRemoved = duplicatesRemoved;
    if (duplicatesRemoved > 0) {
      result.issues.push(`Found ${duplicatesRemoved} duplicate queue entries`);
      result.fixes.push(`Removed ${duplicatesRemoved} duplicate queue entries`);
    }
    
    // 3. Check for orphaned matches (matches where users are not in rooms)
    result.checksPerformed.push('Check for orphaned matches');
    const orphanedRemoved = await removeOrphanedMatches();
    result.stats.orphanedMatchesRemoved = orphanedRemoved;
    if (orphanedRemoved > 0) {
      result.issues.push(`Found ${orphanedRemoved} orphaned matches`);
      result.fixes.push(`Removed ${orphanedRemoved} orphaned matches`);
    }
    
    // 4. Sync room and queue states
    result.checksPerformed.push('Sync room and queue states');
    const syncResult = await syncRoomAndQueueStates();
    if (syncResult.usersAddedToQueue > 0) {
      result.fixes.push(`Added ${syncResult.usersAddedToQueue} users to queue who were alone in rooms`);
    }
    if (syncResult.usersRemovedFromQueue > 0) {
      result.fixes.push(`Removed ${syncResult.usersRemovedFromQueue} users from queue who were not in rooms`);
    }
    if (syncResult.roomsCleaned > 0) {
      result.fixes.push(`Cleaned up ${syncResult.roomsCleaned} stale rooms`);
    }
    
    // 5. Get current stats
    const queuedUsers = await redis.zrange(MATCHING_QUEUE, 0, -1);
    result.stats.usersInQueue = queuedUsers.length;
    
    const activeMatches = await redis.hgetall(ACTIVE_MATCHES);
    result.stats.activeMatches = Object.keys(activeMatches).length;
    
    console.log('State consistency check completed:', result);
    
  } catch (error) {
    console.error('Error during consistency check:', error);
    result.issues.push(`Error during consistency check: ${error}`);
  } finally {
    // Release the lock
    const currentLock = await redis.get(STATE_CONSISTENCY_LOCK);
    if (currentLock === lockId) {
      await redis.del(STATE_CONSISTENCY_LOCK);
    }
  }
  
  return result;
}

/**
 * Remove duplicate entries for the same user in the queue
 */
async function removeDuplicateQueueEntries(): Promise<number> {
  let duplicatesRemoved = 0;
  
  try {
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1, 'WITHSCORES');
    const userEntries = new Map<string, Array<{ data: string; score: number }>>();
    
    // Group entries by username
    for (let i = 0; i < allQueuedUsersRaw.length; i += 2) {
      const userData = allQueuedUsersRaw[i];
      const score = parseFloat(allQueuedUsersRaw[i + 1]);
      
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        if (!userEntries.has(user.username)) {
          userEntries.set(user.username, []);
        }
        userEntries.get(user.username)!.push({ data: userData, score });
      } catch {
        // Remove corrupted entries
        await redis.zrem(MATCHING_QUEUE, userData);
        duplicatesRemoved++;
      }
    }
    
    // Remove duplicates, keeping the most recent entry
    for (const [username, entries] of userEntries.entries()) {
      if (entries.length > 1) {
        console.log(`Found ${entries.length} entries for user ${username}, removing duplicates`);
        
        // Sort by score (timestamp) descending
        entries.sort((a, b) => b.score - a.score);
        
        // Keep the first (most recent) entry, remove the rest
        for (let i = 1; i < entries.length; i++) {
          await redis.zrem(MATCHING_QUEUE, entries[i].data);
          duplicatesRemoved++;
        }
      }
    }
    
  } catch (error) {
    console.error('Error removing duplicate queue entries:', error);
  }
  
  return duplicatesRemoved;
}

/**
 * Remove matches where users are no longer in the system
 */
async function removeOrphanedMatches(): Promise<number> {
  let orphanedRemoved = 0;
  
  try {
    const allMatches = await redis.hgetall(ACTIVE_MATCHES);
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
    
    // Build a set of all users in the queue
    const usersInQueue = new Set<string>();
    for (const userData of allQueuedUsersRaw) {
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        usersInQueue.add(user.username);
      } catch {
        // Skip corrupted entries
      }
    }
    
    // Check each match
    for (const [roomName, matchData] of Object.entries(allMatches)) {
      try {
        const match = JSON.parse(matchData) as ActiveMatch;
        
        // Check if match is older than 30 minutes
        const matchAge = Date.now() - match.matchedAt;
        if (matchAge > 1800000) { // 30 minutes
          console.log(`Removing stale match in room ${roomName} (age: ${matchAge}ms)`);
          await redis.hdel(ACTIVE_MATCHES, roomName);
          orphanedRemoved++;
          continue;
        }
        
        // Check if both users exist in the system (either in queue or have left-behind state)
        const user1LeftBehind = await redis.exists(`left_behind:${match.user1}`);
        const user2LeftBehind = await redis.exists(`left_behind:${match.user2}`);
        
        const user1InSystem = usersInQueue.has(match.user1) || user1LeftBehind;
        const user2InSystem = usersInQueue.has(match.user2) || user2LeftBehind;
        
        if (!user1InSystem && !user2InSystem) {
          console.log(`Removing orphaned match in room ${roomName} - neither user in system`);
          await redis.hdel(ACTIVE_MATCHES, roomName);
          orphanedRemoved++;
        }
      } catch {
        // Error processing match in room, remove corrupted match data
        await redis.hdel(ACTIVE_MATCHES, roomName);
        orphanedRemoved++;
      }
    }
    
  } catch (error) {
    console.error('Error removing orphaned matches:', error);
  }
  
  return orphanedRemoved;
}

/**
 * Start the background consistency checker
 */
export function startConsistencyChecker(intervalMs: number = 30000): void {
  if (consistencyCheckInterval) {
    console.log('Consistency checker already running');
    return;
  }
  
  console.log(`Starting consistency checker with interval ${intervalMs}ms`);
  
  // Run an initial check after a short delay
  setTimeout(() => {
    runConsistencyCheck().catch(error => {
      console.error('Error in initial consistency check:', error);
    });
  }, 5000);
  
  // Set up periodic checks
  consistencyCheckInterval = setInterval(async () => {
    try {
      await runConsistencyCheck();
    } catch (error) {
      console.error('Error in periodic consistency check:', error);
    }
  }, intervalMs);
}

/**
 * Stop the background consistency checker
 */
export function stopConsistencyChecker(): void {
  if (consistencyCheckInterval) {
    clearInterval(consistencyCheckInterval);
    consistencyCheckInterval = null;
    console.log('Stopped consistency checker');
  }
}

// Auto-start in server environments
if (typeof window === 'undefined') {
  setTimeout(() => {
    startConsistencyChecker();
  }, 10000); // Start after 10 seconds
} 