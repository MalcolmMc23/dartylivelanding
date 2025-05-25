import redis from '../../lib/redis';
import { MATCHING_QUEUE, ACTIVE_MATCHES } from './constants';
import { UserDataInQueue, ActiveMatch } from './types';
import { removeUserFromQueue } from './queueManager';
import { generateUniqueRoomName } from './roomManager';
import { canRematch, recordRecentMatch } from './rematchCooldown';
import { acquireMatchLock, releaseMatchLock } from './lockManager';

// Background queue processor settings
const PROCESSOR_INTERVAL = 3000; // Check every 3 seconds
const MAX_PROCESSING_TIME = 2000; // Max time to spend processing per cycle
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
    // Try to acquire processing lock
    lockAcquired = await acquireMatchLock(lockId, 5000); // 5 second timeout
    
    if (!lockAcquired) {
      console.log('Queue processor: Could not acquire lock, skipping this cycle');
      return result;
    }

    console.log('Queue processor: Starting queue processing cycle');

    // Get all users from the queue
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
    
    if (allQueuedUsersRaw.length < 2) {
      console.log(`Queue processor: Not enough users in queue (${allQueuedUsersRaw.length})`);
      return result;
    }

    // Parse users into structured data
    const allQueuedUsers: UserDataInQueue[] = [];
    for (const userData of allQueuedUsersRaw) {
      try {
        const user = JSON.parse(userData) as UserDataInQueue;
        allQueuedUsers.push(user);
        result.usersProcessed++;
      } catch (e) {
        result.errors.push(`Error parsing user data: ${e}`);
      }
    }

    console.log(`Queue processor: Found ${allQueuedUsers.length} users to process`);

    // Sort all users by joinedAt timestamp (FIFO - first in, first out)
    const sortedUsers = allQueuedUsers.sort((a, b) => a.joinedAt - b.joinedAt);

    console.log(`Queue processor: Processing ${sortedUsers.length} users in FIFO order`);

    // Process matches with time limit
    const timeLimit = startTime + MAX_PROCESSING_TIME;

    // Match users in FIFO order - no priority based on state
    await processUsersInFIFOOrder(sortedUsers, result, timeLimit);

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
    
    // Skip if this user has already been matched
    if (matchedUsers.has(user1.username)) continue;
    
    for (let j = i + 1; j < sortedUsers.length && Date.now() < timeLimit; j++) {
      const user2 = sortedUsers[j];
      
      // Skip if this user has already been matched
      if (matchedUsers.has(user2.username)) continue;
      
      // Try to create a match
      const matchCreated = await attemptMatch(user1, user2, result);
      if (matchCreated) {
        // Mark both users as matched
        matchedUsers.add(user1.username);
        matchedUsers.add(user2.username);
        break; // Break inner loop to move to next user1
      }
    }
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
    // Check if they can be matched (cooldown, etc.)
    const traditionalCooldown1 = user1.lastMatch?.matchedWith === user2.username && 
        (Date.now() - user1.lastMatch.timestamp < 2000);
    const traditionalCooldown2 = user2.lastMatch?.matchedWith === user1.username && 
        (Date.now() - user2.lastMatch.timestamp < 2000);
    
    if (traditionalCooldown1 || traditionalCooldown2) {
      console.log(`Queue processor: Skipping ${user1.username} + ${user2.username} due to traditional cooldown`);
      return false;
    }

    // Check new cooldown system (no bypass - treat all users equally)
    const canRematchResult = await canRematch(user1.username, user2.username, false);
    
    if (!canRematchResult) {
      console.log(`Queue processor: Skipping ${user1.username} + ${user2.username} due to new cooldown system`);
      return false;
    }

    // Remove both users from queue
    await removeUserFromQueue(user1.username);
    await removeUserFromQueue(user2.username);

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
    
    // Record match for cooldown system (no special skip scenario handling)
    await recordRecentMatch(user1.username, user2.username, 2, false);

    console.log(`Queue processor: Successfully matched ${user1.username} (${user1.state}) with ${user2.username} (${user2.state}) in room ${roomName}`);
    
    result.matchesCreated++;
    return true;

  } catch (error) {
    const errorMsg = `Error matching ${user1.username} with ${user2.username}: ${error}`;
    result.errors.push(errorMsg);
    console.error(`Queue processor: ${errorMsg}`);
    return false;
  }
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