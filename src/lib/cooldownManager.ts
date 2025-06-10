import redis from './redis';

const COOLDOWN_TTL_SECONDS = 30;
const COOLDOWN_KEY_PREFIX = 'cooldown:';

/**
 * Manages cooldowns between user pairs to prevent immediate re-matching.
 */
export class CooldownManager {
  /**
   * Generates a consistent, sorted key for a pair of user IDs.
   * This ensures the key is the same regardless of the order of user IDs.
   * e.g., createKey('userB', 'userA') -> "cooldown:userA:userB"
   *
   * @param userId1 - The first user ID.
   * @param userId2 - The second user ID.
   * @returns The formatted cooldown key.
   */
  private createKey(userId1: string, userId2: string): string {
    const sortedIds = [userId1, userId2].sort();
    return `${COOLDOWN_KEY_PREFIX}${sortedIds[0]}:${sortedIds[1]}`;
  }

  /**
   * Sets a cooldown for a pair of users.
   *
   * @param userId1 - The first user ID.
   * @param userId2 - The second user ID.
   * @param ttlSeconds - Optional TTL in seconds, defaults to 30.
   * @returns Promise<void>
   */
  async setCooldown(userId1: string, userId2: string, ttlSeconds: number = COOLDOWN_TTL_SECONDS): Promise<void> {
    const key = this.createKey(userId1, userId2);
    // The value '1' is arbitrary, we only care about the key's existence and TTL.
    await redis.setex(key, ttlSeconds, '1');
    console.log(`[CooldownManager] Cooldown set for ${userId1} and ${userId2} for ${ttlSeconds}s.`);
  }

  /**
   * Checks if a pair of users is currently in a cooldown period.
   *
   * @param userId1 - The first user ID.
   * @param userId2 - The second user ID.
   * @returns Promise<boolean> - True if the pair is in cooldown, false otherwise.
   */
  async isPairInCooldown(userId1: string, userId2: string): Promise<boolean> {
    const key = this.createKey(userId1, userId2);
    const result = await redis.get(key);
    return result !== null;
  }

  /**
   * Checks multiple pairs for cooldown status in a batch.
   *
   * @param pairs - An array of user ID pairs. e.g., [['userA', 'userB'], ['userC', 'userD']]
   * @returns Promise<Record<string, boolean>> - A map where keys are the pair keys and values are their cooldown status.
   */
  async checkMultiplePairs(pairs: [string, string][]): Promise<Record<string, boolean>> {
    if (pairs.length === 0) {
      return {};
    }
    const keys = pairs.map(pair => this.createKey(pair[0], pair[1]));
    const results = await redis.mget(...keys);

    const cooldownStatus: Record<string, boolean> = {};
    keys.forEach((key, index) => {
      cooldownStatus[key] = results[index] !== null;
    });

    return cooldownStatus;
  }
}

// Export a singleton instance
export const cooldownManager = new CooldownManager(); 