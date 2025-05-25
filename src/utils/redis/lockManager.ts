import redis from '../../lib/redis';
import { MATCH_LOCK_KEY, LOCK_EXPIRY } from './constants';

// Acquire a lock for matching operations with exponential backoff
export async function acquireMatchLock(lockId: string, expiry = LOCK_EXPIRY): Promise<boolean> {
  // Try to set the lock with NX (only if it doesn't exist)
  try {
    // Store the start time for logging
    const startTime = Date.now();
    
    // First attempt
    const result = await redis.set(MATCH_LOCK_KEY, lockId, 'EX', expiry, 'NX');
    if (result === "OK") {
      // Store timestamp when lock was acquired
      const acquiredTime = Date.now();
      await redis.set(`${MATCH_LOCK_KEY}:time`, acquiredTime.toString(), 'EX', expiry + 5);
      console.log(`Lock ${lockId} acquired on first attempt. Took ${acquiredTime - startTime}ms.`);
      return true;
    }
    
    // Implement exponential backoff for retries
    const maxRetries = 3;
    let retryDelay = 200; // Start with 200ms
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      console.log(`Lock acquisition attempt ${attempt + 2} for ${lockId}, waiting ${retryDelay}ms`);
      
      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay *= 2; // Exponential backoff
      
      // Check if current lock has expired or been held too long
      const lockTime = await redis.get(`${MATCH_LOCK_KEY}:time`);
      const currentLockId = await redis.get(MATCH_LOCK_KEY);
      const currentTime = Date.now();
      
      // Force release if lock has been held for more than 10 seconds
      // or if the lock time record is missing but the lock exists
      if ((lockTime && (currentTime - parseInt(lockTime)) > 10000) || 
          (currentLockId && !lockTime && currentLockId !== lockId)) {
        const heldDuration = lockTime ? (currentTime - parseInt(lockTime))/1000 : 'unknown time';
        console.warn(`Force releasing STALE lock (held by ${currentLockId || 'unknown'}) after ${heldDuration} seconds. Current request is for ${lockId}.`);
        await redis.del(MATCH_LOCK_KEY);
        await redis.del(`${MATCH_LOCK_KEY}:time`);
      }
      
      // Try again to acquire the lock
      const retryResult = await redis.set(MATCH_LOCK_KEY, lockId, 'EX', expiry, 'NX');
      if (retryResult === "OK") {
        // Store timestamp when lock was acquired
        const acquiredTime = Date.now();
        await redis.set(`${MATCH_LOCK_KEY}:time`, acquiredTime.toString(), 'EX', expiry + 5);
        console.log(`Lock ${lockId} acquired on attempt ${attempt + 2}. Took ${acquiredTime - startTime}ms total.`);
        return true;
      }
    }
    
    console.warn(`Failed to acquire lock for ${lockId} after ${maxRetries + 1} attempts. Total time: ${Date.now() - startTime}ms.`);
    return false;
  } catch (error) {
    console.error('Error acquiring lock:', error);
    return false;
  }
}

export async function releaseMatchLock(lockId: string): Promise<boolean> {
  try {
    // Check if we're using the fake Redis implementation
    const isFakeRedis = !process.env.REDIS_URL;
    
    if (isFakeRedis) {
      // Simplified fallback for fake Redis without using eval
      const currentLock = await redis.get(MATCH_LOCK_KEY);
      if (currentLock === lockId) {
        await redis.del(MATCH_LOCK_KEY);
        await redis.del(`${MATCH_LOCK_KEY}:time`);
        console.log(`Lock ${lockId} released successfully (fallback method).`);
        return true;
      } else if (currentLock) {
        console.warn(`Lock ${lockId} NOT released (fallback method). Current lock held by ${currentLock}.`);
      } else {
        console.log(`Lock ${lockId} NOT released (fallback method). No lock found.`);
      }
      return false;
    } else {
      // Use Lua script for production Redis
      const script = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          redis.call('del', KEYS[1])
          redis.call('del', KEYS[2])
          return 1
        else
          return 0
        end
      `;
      
      // Execute the script atomically
      const result = await redis.eval(
        script,
        2, // Number of keys
        MATCH_LOCK_KEY, 
        `${MATCH_LOCK_KEY}:time`,
        lockId // ARGV[1]
      );
      
      const released = result === 1;
      if (released) {
        console.log(`Lock ${lockId} released successfully.`);
      } else {
        // Check if the lock even exists
        const currentLock = await redis.get(MATCH_LOCK_KEY);
        if (!currentLock) {
          console.log(`Lock ${lockId} was already released (or expired) by someone else or never acquired.`);
        } else {
          console.warn(`Failed to release lock ${lockId}. Current lock: ${currentLock}.`);
        }
      }
      
      return released;
    }
  } catch (error) {
    console.error(`Error releasing lock ${lockId}:`, error);
    
    // Fallback attempt to release lock in case of script error
    try {
      const currentLock = await redis.get(MATCH_LOCK_KEY);
      if (currentLock === lockId) {
        await redis.del(MATCH_LOCK_KEY);
        await redis.del(`${MATCH_LOCK_KEY}:time`);
        console.log(`Lock ${lockId} released using fallback method after script error.`);
        return true;
      }
    } catch (fallbackError) {
      console.error(`Fallback lock release for ${lockId} also failed:`, fallbackError);
    }
    
    return false;
  }
} 