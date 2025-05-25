import redis from '../../lib/redis';
import { RECENT_MATCH_PREFIX } from './constants';

/**
 * Simplified cooldown system - single source of truth
 * Returns true if users CAN be matched (no active cooldown)
 */
export async function canRematch(user1: string, user2: string): Promise<boolean> {
  const key = `${RECENT_MATCH_PREFIX}${[user1, user2].sort().join(':')}`;
  const exists = await redis.exists(key);
  return exists === 0; // Can match if no cooldown exists
}

/**
 * Records a cooldown between two users
 * Reduced cooldown times: 10 seconds for normal disconnections, 30 seconds for skips
 */
export async function recordCooldown(
  user1: string, 
  user2: string, 
  type: 'normal' | 'skip' = 'normal'
): Promise<void> {
  const cooldownSeconds = type === 'skip' ? 30 : 10; // Reduced from 120/30 to 30/10
  
  const key = `${RECENT_MATCH_PREFIX}${[user1, user2].sort().join(':')}`;
  await redis.set(key, Date.now().toString(), 'EX', cooldownSeconds);
  
  console.log(`Set ${cooldownSeconds}s cooldown between ${user1} and ${user2} (${type})`);
}

/**
 * Clear cooldown between two users (for admin/emergency scenarios)
 */
export async function clearCooldown(user1: string, user2: string): Promise<void> {
  const key = `${RECENT_MATCH_PREFIX}${[user1, user2].sort().join(':')}`;
  await redis.del(key);
  console.log(`Cleared cooldown between ${user1} and ${user2}`);
}

/**
 * Get remaining cooldown time in seconds (for debugging)
 */
export async function getCooldownRemaining(user1: string, user2: string): Promise<number> {
  const key = `${RECENT_MATCH_PREFIX}${[user1, user2].sort().join(':')}`;
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : 0;
}

// Legacy function aliases for backward compatibility
export const recordRecentMatch = recordCooldown;
export const recordSkip = (user1: string, user2: string) => recordCooldown(user1, user2, 'skip'); 