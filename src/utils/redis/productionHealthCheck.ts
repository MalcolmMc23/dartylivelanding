import redis from '../../lib/redis';
import { 
  startQueueProcessor, 
  stopQueueProcessor, 
  isQueueProcessorRunning,
  triggerQueueProcessing 
} from './queueProcessor';
import { MATCHING_QUEUE, ACTIVE_MATCHES, MATCH_LOCK_KEY } from './constants';

interface HealthCheckResult {
  redis: boolean;
  queueProcessor: boolean;
  lockStatus: string;
  queueCount: number;
  activeMatches: number;
  errors: string[];
  recommendations: string[];
}

/**
 * Comprehensive health check for production matching system
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    redis: false,
    queueProcessor: false,
    lockStatus: 'unknown',
    queueCount: 0,
    activeMatches: 0,
    errors: [],
    recommendations: []
  };

  try {
    // Test Redis connection
    await redis.ping();
    result.redis = true;
  } catch (error) {
    result.redis = false;
    result.errors.push(`Redis connection failed: ${error}`);
    result.recommendations.push('Check REDIS_URL environment variable and Redis server status');
  }

  try {
    // Check queue processor status
    result.queueProcessor = isQueueProcessorRunning();
    if (!result.queueProcessor) {
      result.errors.push('Queue processor is not running');
      result.recommendations.push('Start the queue processor using startQueueProcessor()');
    }
  } catch (error) {
    result.errors.push(`Queue processor check failed: ${error}`);
  }

  try {
    // Check lock status
    const lockValue = await redis.get(MATCH_LOCK_KEY);
    const lockTime = await redis.get(`${MATCH_LOCK_KEY}:time`);
    
    if (!lockValue) {
      result.lockStatus = 'free';
    } else if (lockTime) {
      const age = Date.now() - parseInt(lockTime);
      result.lockStatus = `held for ${Math.round(age/1000)}s`;
      
      if (age > 15000) { // 15 seconds
        result.errors.push('Match lock held too long, possible deadlock');
        result.recommendations.push('Clear stale lock using clearStaleLocks()');
      }
    } else {
      result.lockStatus = 'held (no timestamp)';
      result.errors.push('Lock exists but no timestamp found');
      result.recommendations.push('Clear corrupted lock');
    }
  } catch (error) {
    result.errors.push(`Lock status check failed: ${error}`);
  }

  try {
    // Check queue count
    const queueUsers = await redis.zrange(MATCHING_QUEUE, 0, -1);
    result.queueCount = queueUsers.length;
    
    if (result.queueCount > 50) {
      result.errors.push('Queue unusually large');
      result.recommendations.push('Check for stuck users in queue');
    }
  } catch (error) {
    result.errors.push(`Queue count check failed: ${error}`);
  }

  try {
    // Check active matches
    const matches = await redis.hgetall(ACTIVE_MATCHES);
    result.activeMatches = Object.keys(matches).length;
  } catch (error) {
    result.errors.push(`Active matches check failed: ${error}`);
  }

  return result;
}

/**
 * Auto-repair common production issues
 */
export async function autoRepairProductionIssues(): Promise<string[]> {
  const repairs: string[] = [];

  try {
    const health = await performHealthCheck();

    // Repair 1: Start queue processor if not running
    if (!health.queueProcessor && health.redis) {
      try {
        startQueueProcessor();
        repairs.push('Started queue processor');
      } catch (error) {
        repairs.push(`Failed to start queue processor: ${error}`);
      }
    }

    // Repair 2: Clear stale locks
    if (health.lockStatus.includes('held for') && health.lockStatus.includes('s')) {
      const seconds = parseInt(health.lockStatus.match(/(\d+)s/)?.[1] || '0');
      if (seconds > 15) {
        await clearStaleLocks();
        repairs.push(`Cleared stale lock (${seconds}s old)`);
      }
    }

    // Repair 3: Clean up queue if too large
    if (health.queueCount > 50) {
      const cleaned = await cleanupStuckUsers();
      repairs.push(`Cleaned up ${cleaned} stuck users from queue`);
    }

    // Repair 4: Trigger processing if users are waiting
    if (health.queueCount > 0 && health.queueProcessor) {
      try {
        const result = await triggerQueueProcessing();
        repairs.push(`Triggered queue processing: ${result.matchesCreated} matches created`);
      } catch (error) {
        repairs.push(`Failed to trigger queue processing: ${error}`);
      }
    }

  } catch (error) {
    repairs.push(`Auto-repair failed: ${error}`);
  }

  return repairs;
}

/**
 * Clear stale locks
 */
export async function clearStaleLocks(): Promise<boolean> {
  try {
    const lockTime = await redis.get(`${MATCH_LOCK_KEY}:time`);
    
    if (lockTime) {
      const age = Date.now() - parseInt(lockTime);
      if (age > 10000) { // 10 seconds
        await redis.del(MATCH_LOCK_KEY);
        await redis.del(`${MATCH_LOCK_KEY}:time`);
        console.log(`Cleared stale lock that was ${Math.round(age/1000)} seconds old`);
        return true;
      }
    } else {
      // Lock exists but no timestamp - clear it
      const lockExists = await redis.get(MATCH_LOCK_KEY);
      if (lockExists) {
        await redis.del(MATCH_LOCK_KEY);
        console.log('Cleared lock with no timestamp');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error clearing stale locks:', error);
    return false;
  }
}

/**
 * Clean up users who have been in queue too long
 */
export async function cleanupStuckUsers(): Promise<number> {
  try {
    const cutoffTime = Date.now() - (10 * 60 * 1000); // 10 minutes
    const removed = await redis.zremrangebyscore(MATCHING_QUEUE, 0, cutoffTime);
    
    if (removed > 0) {
      console.log(`Cleaned up ${removed} users who were stuck in queue for more than 10 minutes`);
    }
    
    return removed;
  } catch (error) {
    console.error('Error cleaning up stuck users:', error);
    return 0;
  }
}

/**
 * Force restart the entire matching system
 */
export async function forceRestartMatchingSystem(): Promise<string[]> {
  const steps: string[] = [];

  try {
    // Stop queue processor
    stopQueueProcessor();
    steps.push('Stopped queue processor');

    // Clear all locks
    await redis.del(MATCH_LOCK_KEY);
    await redis.del(`${MATCH_LOCK_KEY}:time`);
    steps.push('Cleared all locks');

    // Clean up old queue entries
    const removed = await cleanupStuckUsers();
    steps.push(`Cleaned up ${removed} stuck users`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Restart queue processor
    startQueueProcessor();
    steps.push('Restarted queue processor');

    // Trigger initial processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = await triggerQueueProcessing();
    steps.push(`Initial processing: ${result.matchesCreated} matches created from ${result.usersProcessed} users`);

  } catch (error) {
    steps.push(`Error during restart: ${error}`);
  }

  return steps;
}

/**
 * Get detailed system status for debugging
 */
export async function getDetailedSystemStatus() {
  const health = await performHealthCheck();
  
  const queueDetails = [];
  try {
    const queueUsers = await redis.zrange(MATCHING_QUEUE, 0, -1, 'WITHSCORES');
    for (let i = 0; i < queueUsers.length; i += 2) {
      const userData = queueUsers[i];
      const timestamp = parseInt(queueUsers[i + 1]);
      const age = Math.round((Date.now() - timestamp) / 1000);
      
      try {
        const parsed = JSON.parse(userData);
        queueDetails.push({
          username: parsed.username,
          state: parsed.state,
          ageSeconds: age,
          useDemo: parsed.useDemo
        });
      } catch {
        queueDetails.push({
          username: 'unknown',
          data: userData,
          ageSeconds: age
        });
      }
    }
  } catch (error) {
    queueDetails.push({ error: `Failed to get queue details: ${error}` });
  }

  return {
    ...health,
    queueDetails,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown'
  };
} 