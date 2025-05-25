import redis from '../../lib/redis';
import { MATCHING_QUEUE, ACTIVE_MATCHES } from './constants';
import { UserDataInQueue, ActiveMatch } from './types';
import { removeUserFromQueue, addUserToQueue } from './queueManager';
import { generateUniqueRoomName } from './roomManager';
import { canRematch, recordCooldown } from './rematchCooldown';
import { acquireMatchLock, releaseMatchLock } from './lockManager';
import { syncRoomAndQueueStates } from './roomStateManager';
import { stopTrackingUserAlone } from './aloneUserManager';

// Background queue processor settings
const PROCESSOR_INTERVAL = 3000; // Check every 3 seconds
let isProcessorRunning = false;
let processorInterval: NodeJS.Timeout | null = null;

// Track last processing time to avoid overlapping runs
let lastProcessingTime = 0;

export interface MatchProcessorResult {
  matchesCreated: number;
  usersProcessed: number;
  errors: string[];
}

/**
 * Background queue processor that continuously attempts to match users in the queue
 */
export async function processQueueMatches(): Promise<MatchProcessorResult> {
  const startTime = Date.now();
  const result: MatchProcessorResult = {
    matchesCreated: 0,
    usersProcessed: 0,
    errors: []
  };

  // Prevent overlapping processing
  if (Date.now() - lastProcessingTime < 1000) {
    return result;
  }
  lastProcessingTime = Date.now();

  const lockId = `queue-processor-${Date.now()}`;
  let lockAcquired = false;

  try {
    // Try to acquire processing lock with longer timeout
    lockAcquired = await acquireMatchLock(lockId, 10000); // 10 second timeout
    
    if (!lockAcquired) {
      console.log('Queue processor: Could not acquire lock, skipping this cycle');
      return result;
    }

    console.log('Queue processor: Starting queue processing cycle');

    // 1. SYNC ROOM AND QUEUE STATES
    const syncResult = await syncRoomAndQueueStates();
    console.log('Queue processor: Room sync result:', syncResult);

    // 2. CLEANUP ORPHANED IN-CALL USERS
    await cleanupOrphanedInCallUsers(result);

    // 3. GET ALL QUEUED USERS AND REMOVE DUPLICATES
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1, 'WITHSCORES');
    const userMap = new Map<string, { userData: UserDataInQueue; score: number; rawData: string }>();
    const duplicatesToRemove: string[] = [];
    
    // Process users and keep only the earliest entry for each username
    for (let i = 0; i < allQueuedUsersRaw.length; i += 2) {
      const rawData = allQueuedUsersRaw[i];
      const score = parseFloat(allQueuedUsersRaw[i + 1]);
      
      try {
        const userData = JSON.parse(rawData) as UserDataInQueue;
        
        // Validate user data
        if (!userData.username || typeof userData.username !== 'string') {
          duplicatesToRemove.push(rawData);
          continue;
        }
        
        const existing = userMap.get(userData.username);
        if (existing) {
          // Keep the earlier entry (lower score/timestamp)
          if (score < existing.score) {
            duplicatesToRemove.push(existing.rawData);
            userMap.set(userData.username, { userData, score, rawData });
          } else {
            duplicatesToRemove.push(rawData);
          }
        } else {
          userMap.set(userData.username, { userData, score, rawData });
        }
      } catch (e) {
        console.error('Queue processor: Error parsing user data:', e);
        duplicatesToRemove.push(rawData);
      }
    }
    
    // Remove duplicates and invalid entries atomically
    if (duplicatesToRemove.length > 0) {
      await redis.zrem(MATCHING_QUEUE, ...duplicatesToRemove);
      console.log(`Queue processor: Removed ${duplicatesToRemove.length} duplicate/invalid entries`);
    }

    // 4. CONVERT MAP TO SORTED ARRAY (FIFO)
    const sortedUsers = Array.from(userMap.values())
      .sort((a, b) => a.score - b.score)
      .map(item => item.userData);
    
    console.log(`Queue processor: Processing ${sortedUsers.length} unique users`);

    // 5. PROCESS USERS IN FIFO ORDER
    await processUsersInFIFOOrder(sortedUsers, result, startTime + 8000); // 8 second time limit

    console.log(`Queue processor: Created ${result.matchesCreated} matches in ${Date.now() - startTime}ms`);

  } catch (error) {
    const errorMsg = `Queue processor error: ${error}`;
    result.errors.push(errorMsg);
    console.error(errorMsg);
  } finally {
    if (lockAcquired) {
      await releaseMatchLock(lockId);
    }
  }

  return result;
}

/**
 * Process users in FIFO order - match users based on arrival time, not state
 */
async function processUsersInFIFOOrder(
  sortedUsers: UserDataInQueue[], 
  result: MatchProcessorResult, 
  timeLimit: number
) {
  // Keep track of matched users to avoid double-matching
  const matchedUsers = new Set<string>();
  
  // Process users in pairs, matching the first available user with the next available user
  for (let i = 0; i < sortedUsers.length - 1 && Date.now() < timeLimit; i++) {
    const user1 = sortedUsers[i];
    
    // Skip if this user has already been matched in this cycle
    if (matchedUsers.has(user1.username)) continue;
    
    // Also skip if user is already in an active match (double-check)
    const activeMatch = await checkUserInActiveMatch(user1.username);
    if (activeMatch) {
      console.log(`Queue processor: ${user1.username} is already in active match, skipping`);
      matchedUsers.add(user1.username);
      continue;
    }
    
    for (let j = i + 1; j < sortedUsers.length && Date.now() < timeLimit; j++) {
      const user2 = sortedUsers[j];
      
      // Skip if this user has already been matched in this cycle
      if (matchedUsers.has(user2.username)) continue;
      
      // Try to create a match
      const matchCreated = await attemptMatch(user1, user2, result);
      if (matchCreated) {
        // Mark both users as matched
        matchedUsers.add(user1.username);
        matchedUsers.add(user2.username);
        result.matchesCreated++;
        break; // Break inner loop to move to next user1
      }
    }
    
    result.usersProcessed++;
  }
}

/**
 * Attempt to create a match between two users
 */
async function attemptMatch(
  user1: UserDataInQueue, 
  user2: UserDataInQueue, 
  result: MatchProcessorResult
): Promise<boolean> {
  try {
    // CRITICAL: Prevent self-matching
    if (user1.username === user2.username) {
      console.log(`Queue processor: Preventing self-match for ${user1.username}`);
      return false;
    }
    
    // Double-check neither user is already matched
    const [match1, match2] = await Promise.all([
      checkUserInActiveMatch(user1.username),
      checkUserInActiveMatch(user2.username)
    ]);
    
    if (match1 || match2) {
      console.log(`Queue processor: One or both users already matched, skipping`);
      return false;
    }
    
    // Check cooldown system - single source of truth
    const canRematchResult = await canRematch(user1.username, user2.username);
    
    if (!canRematchResult) {
      console.log(`Queue processor: Skipping ${user1.username} + ${user2.username} due to cooldown`);
      return false;
    }

    // Remove both users from queue BEFORE creating the match
    const [removed1, removed2] = await Promise.all([
      removeUserFromQueue(user1.username),
      removeUserFromQueue(user2.username)
    ]);
    
    if (!removed1 || !removed2) {
      console.log(`Queue processor: Failed to remove users from queue, skipping match`);
      // Re-add users if only one was removed
      if (removed1 && !removed2) {
        await addUserToQueue(user1.username, user1.useDemo, user1.state, user1.roomName);
      } else if (!removed1 && removed2) {
        await addUserToQueue(user2.username, user2.useDemo, user2.state, user2.roomName);
      }
      return false;
    }
    
    // Stop tracking both users as alone since they're being matched
    await Promise.all([
      stopTrackingUserAlone(user1.username),
      stopTrackingUserAlone(user2.username)
    ]);

    // Determine room name (use existing room if available, otherwise create new)
    let roomName = user1.roomName || user2.roomName;
    if (!roomName) {
      roomName = await generateUniqueRoomName();
    }

    // Create match record
    const matchData: ActiveMatch = {
      user1: user1.username,
      user2: user2.username,
      roomName,
      useDemo: user1.useDemo || user2.useDemo,
      matchedAt: Date.now()
    };

    await redis.hset(ACTIVE_MATCHES, roomName, JSON.stringify(matchData));
    
    // Record cooldown for normal match
    await recordCooldown(user1.username, user2.username, 'normal');

    console.log(`Queue processor: Successfully matched ${user1.username} (${user1.state}) with ${user2.username} (${user2.state}) in room ${roomName}`);
    
    return true;

  } catch (error) {
    const errorMsg = `Error matching ${user1.username} with ${user2.username}: ${error}`;
    result.errors.push(errorMsg);
    console.error(`Queue processor: ${errorMsg}`);
    
    // Try to re-add users to queue on error
    try {
      await Promise.all([
        addUserToQueue(user1.username, user1.useDemo, user1.state, user1.roomName),
        addUserToQueue(user2.username, user2.useDemo, user2.state, user2.roomName)
      ]);
    } catch (readdError) {
      console.error('Queue processor: Error re-adding users to queue:', readdError);
    }
    
    return false;
  }
}

// Helper to check if user is in an active match
async function checkUserInActiveMatch(username: string): Promise<boolean> {
  const allMatches = await redis.hgetall(ACTIVE_MATCHES);
  
  for (const matchData of Object.values(allMatches)) {
    try {
      const match = JSON.parse(matchData as string);
      if (match.user1 === username || match.user2 === username) {
        return true;
      }
    } catch (e) {
      console.error('Error parsing match data:', e);
    }
  }
  
  return false;
}

/**
 * Start the background queue processor
 */
export function startQueueProcessor() {
  if (isProcessorRunning) {
    console.log('Queue processor already running');
    return;
  }

  console.log('Starting background queue processor');
  isProcessorRunning = true;
  
  processorInterval = setInterval(async () => {
    try {
      await processQueueMatches();
    } catch (error) {
      console.error('Queue processor interval error:', error);
    }
  }, PROCESSOR_INTERVAL);
}

/**
 * Stop the background queue processor
 */
export function stopQueueProcessor() {
  if (!isProcessorRunning) {
    return;
  }

  console.log('Stopping background queue processor');
  isProcessorRunning = false;
  
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
  }
}

/**
 * Check if the processor is running
 */
export function isQueueProcessorRunning(): boolean {
  return isProcessorRunning;
}

/**
 * Trigger a single queue processing cycle (for testing or manual triggering)
 */
export async function triggerQueueProcessing(): Promise<MatchProcessorResult> {
  return await processQueueMatches();
}

/**
 * Cleanup orphaned in-call users who are no longer in active matches
 */
async function cleanupOrphanedInCallUsers(result: MatchProcessorResult): Promise<void> {
  console.log('Starting cleanup of orphaned in-call users');
  
  try {
    // Get all active matches
    const activeMatches = await redis.hgetall(ACTIVE_MATCHES);
    const activeUsernames = new Set<string>();
    
    // Collect all users who are in active matches
    for (const matchData of Object.values(activeMatches)) {
      try {
        const match = JSON.parse(matchData as string);
        activeUsernames.add(match.user1);
        activeUsernames.add(match.user2);
      } catch (e) {
        console.error('Error parsing match data during cleanup:', e);
      }
    }
    
    // Get all users in queue
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
    let orphanedCount = 0;
    
    for (const userData of allQueuedUsersRaw) {
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        
        // If user is marked as 'in_call' but not in any active match, they're orphaned
        if (user.state === 'in_call' && !activeUsernames.has(user.username)) {
          console.log(`Found orphaned in-call user: ${user.username}, converting to waiting`);
          
          // Remove from queue and re-add as waiting
          await removeUserFromQueue(user.username);
          await addUserToQueue(user.username, user.useDemo, 'waiting');
          orphanedCount++;
        }
      } catch (e) {
        console.error('Error processing user during orphaned cleanup:', e);
        result.errors.push(`Error processing orphaned user: ${e}`);
      }
    }
    
    console.log(`Found ${orphanedCount} in-call users to check`);
  } catch (error) {
    console.error('Error during orphaned user cleanup:', error);
    result.errors.push(`Orphaned cleanup error: ${error}`);
  }
} 