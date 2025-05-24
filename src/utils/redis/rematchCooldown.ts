import redis from '../../lib/redis';
import { RECENT_MATCH_PREFIX, LEFT_BEHIND_PREFIX } from './constants';

/**
 * Checks if two users can be rematched based on the cooldown system
 * Returns true if they CAN be matched (cooldown expired or never matched)
 */
export async function canRematch(user1: string, user2: string, skipCooldownForLeftBehind = false): Promise<boolean> {
  // If this is for a left-behind user scenario, check if either user was left behind
  if (skipCooldownForLeftBehind) {
    const leftBehindUser1 = await redis.exists(`${LEFT_BEHIND_PREFIX}${user1}`);
    const leftBehindUser2 = await redis.exists(`${LEFT_BEHIND_PREFIX}${user2}`);
    
    if (leftBehindUser1 || leftBehindUser2) {
      console.log(`Bypassing cooldown for left-behind user scenario: ${user1} <-> ${user2}`);
      return true;
    }
  }
  
  // Sort usernames to ensure consistent key regardless of order
  const key = `${RECENT_MATCH_PREFIX}${[user1, user2].sort().join(':')}`;
  const exists = await redis.exists(key);
  // If key doesn't exist, they can be matched
  return exists === 0;
}

/**
 * Records a match between two users, setting the cooldown period
 * Uses shorter cooldown for skip scenarios
 */
export async function recordRecentMatch(
  user1: string, 
  user2: string, 
  cooldownSeconds = 2, // Reduced from 5 to 2 seconds
  isSkipScenario = false
): Promise<void> {
  // Use even shorter cooldown for skip scenarios
  const actualCooldown = isSkipScenario ? 1 : cooldownSeconds;
  
  // Sort usernames to ensure consistent key regardless of order
  const key = `${RECENT_MATCH_PREFIX}${[user1, user2].sort().join(':')}`;
  // Set with expiry - will automatically expire after cooldownSeconds
  await redis.set(key, Date.now().toString(), 'EX', actualCooldown);
  console.log(`Recorded match between ${user1} and ${user2} with ${actualCooldown}s cooldown${isSkipScenario ? ' (skip scenario)' : ''}`);
}

/**
 * Clear cooldown between two users (for emergency reset scenarios)
 */
export async function clearCooldown(user1: string, user2: string): Promise<void> {
  const key = `${RECENT_MATCH_PREFIX}${[user1, user2].sort().join(':')}`;
  await redis.del(key);
  console.log(`Cleared cooldown between ${user1} and ${user2}`);
} 