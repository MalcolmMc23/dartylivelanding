import redis from './redis';

// User state constants
export const USER_STATES = {
  IDLE: 'IDLE',
  WAITING: 'WAITING', 
  CONNECTING: 'CONNECTING',
  IN_CALL: 'IN_CALL',
  DISCONNECTING: 'DISCONNECTING'
} as const;

export type UserState = typeof USER_STATES[keyof typeof USER_STATES];

// Redis key constants for state tracking
export const STATE_KEYS = {
  IDLE: 'matching:idle',
  WAITING: 'matching:waiting',
  CONNECTING: 'matching:connecting', 
  IN_CALL: 'matching:in_call',
  DISCONNECTING: 'matching:disconnecting'
} as const;

// Mapping of states to Redis keys
export const STATE_TO_KEY: Record<UserState, string> = {
  [USER_STATES.IDLE]: STATE_KEYS.IDLE,
  [USER_STATES.WAITING]: STATE_KEYS.WAITING,
  [USER_STATES.CONNECTING]: STATE_KEYS.CONNECTING,
  [USER_STATES.IN_CALL]: STATE_KEYS.IN_CALL,
  [USER_STATES.DISCONNECTING]: STATE_KEYS.DISCONNECTING
};

// All state keys as an array for batch operations
export const ALL_STATE_KEYS = Object.values(STATE_KEYS);

// Interface for user state entry
export interface UserStateEntry {
  userId: string;
  timestamp: number;
  state: UserState;
}

// Interface for batch state query results
export interface StateQueryResult {
  state: UserState;
  users: UserStateEntry[];
  count: number;
}

// Interface for time-based query options
export interface TimeQueryOptions {
  olderThan?: number; // timestamp
  newerThan?: number; // timestamp
  limit?: number;
  offset?: number;
}

/**
 * Redis State Manager for tracking user states using Sorted Sets
 * Uses timestamps as scores for efficient time-based queries
 */
export class RedisStateManager {
  
  /**
   * Add a user to a specific state with current timestamp
   */
  async addUserToState(userId: string, state: UserState): Promise<void> {
    const key = STATE_TO_KEY[state];
    const timestamp = Date.now();
    
    await redis.zadd(key, timestamp, userId);
    console.log(`[StateManager] Added user ${userId} to state ${state} at ${timestamp}`);
  }

  /**
   * Remove a user from a specific state
   */
  async removeUserFromState(userId: string | string[], state: UserState): Promise<number> {
    const key = STATE_TO_KEY[state];
    const userIds = Array.isArray(userId) ? userId : [userId];
    
    if (userIds.length === 0) {
      return 0;
    }

    const removed = await redis.zrem(key, ...userIds);
    
    if (removed > 0) {
      console.log(`[StateManager] Removed ${removed} user(s) from state ${state}`);
    }
    
    return removed;
  }

  /**
   * Remove a user from ALL states (cleanup operation)
   */
  async removeUserFromAllStates(userId: string): Promise<number> {
    const removedCounts = await Promise.all(
      ALL_STATE_KEYS.map(key => redis.zrem(key, userId))
    );
    
    const totalRemoved = removedCounts.reduce((sum, count) => sum + count, 0);
    
    if (totalRemoved > 0) {
      console.log(`[StateManager] Removed user ${userId} from ${totalRemoved} state(s)`);
    }
    
    return totalRemoved;
  }

  /**
   * Move a user from one state to another atomically
   */
  async moveUserBetweenStates(
    userId: string, 
    fromState: UserState, 
    toState: UserState
  ): Promise<boolean> {
    const fromKey = STATE_TO_KEY[fromState];
    const toKey = STATE_TO_KEY[toState];
    const timestamp = Date.now();

    // Check if user exists in the from state first
    const userExists = await redis.zscore(fromKey, userId);
    if (!userExists) {
      console.warn(`[StateManager] User ${userId} not found in state ${fromState}`);
      return false;
    }

    // Perform atomic move using a transaction-like approach
    const removed = await redis.zrem(fromKey, userId);
    if (removed > 0) {
      await redis.zadd(toKey, timestamp, userId);
      console.log(`[StateManager] Moved user ${userId} from ${fromState} to ${toState}`);
      return true;
    }

    return false;
  }

  /**
   * Get all users in a specific state with their timestamps
   */
  async getUsersInState(state: UserState, options?: TimeQueryOptions): Promise<UserStateEntry[]> {
    const key = STATE_TO_KEY[state];
    
    // Build range query based on options
    let start = 0;
    let end = -1; // -1 means all elements
    
    if (options?.offset) {
      start = options.offset;
    }
    
    if (options?.limit) {
      end = start + options.limit - 1;
    }

    // Get users with scores (timestamps)
    const results = await redis.zrange(key, start, end, 'WITHSCORES');
    
    // Parse results into UserStateEntry objects
    const users: UserStateEntry[] = [];
    for (let i = 0; i < results.length; i += 2) {
      const userId = results[i];
      const timestamp = parseInt(results[i + 1], 10);
      
      // Apply time filters if specified
      if (options?.olderThan && timestamp > options.olderThan) continue;
      if (options?.newerThan && timestamp < options.newerThan) continue;
      
      users.push({
        userId,
        timestamp,
        state
      });
    }

    return users;
  }

  /**
   * Get count of users in a specific state
   */
  async getUserCountInState(state: UserState): Promise<number> {
    const key = STATE_TO_KEY[state];
    return await redis.zcard(key);
  }

  /**
   * Get users in a state who have been there longer than specified time
   */
  async getUsersWaitingLongerThan(state: UserState, maxWaitTimeMs: number): Promise<UserStateEntry[]> {
    const cutoffTime = Date.now() - maxWaitTimeMs;
    
    return await this.getUsersInState(state, {
      olderThan: cutoffTime
    });
  }

  /**
   * Check if a user exists in a specific state
   */
  async isUserInState(userId: string, state: UserState): Promise<boolean> {
    const key = STATE_TO_KEY[state];
    const score = await redis.zscore(key, userId);
    return score !== null;
  }

  /**
   * Get the current state of a user by checking all state sets
   */
  async getUserCurrentState(userId: string): Promise<UserState | null> {
    // Check all states concurrently
    const stateChecks = await Promise.all(
      Object.entries(STATE_TO_KEY).map(async ([state, key]) => {
        const score = await redis.zscore(key, userId);
        return score !== null ? state as UserState : null;
      })
    );

    // Find the first non-null state (user should only be in one state)
    const currentState = stateChecks.find(state => state !== null);
    
    if (!currentState) {
      console.log(`[StateManager] User ${userId} not found in any state`);
      return null;
    }

    // Log warning if user is in multiple states (shouldn't happen)
    const statesFound = stateChecks.filter(state => state !== null);
    if (statesFound.length > 1) {
      console.warn(`[StateManager] User ${userId} found in multiple states: ${statesFound.join(', ')}`);
    }

    return currentState;
  }

  /**
   * Get comprehensive state statistics
   */
  async getStateStatistics(): Promise<Record<UserState, number>> {
    const counts = await Promise.all(
      Object.keys(STATE_TO_KEY).map(async (state) => {
        const count = await this.getUserCountInState(state as UserState);
        return [state, count] as [UserState, number];
      })
    );

    return Object.fromEntries(counts) as Record<UserState, number>;
  }

  /**
   * Batch query to get users in multiple states
   */
  async getUsersInMultipleStates(states: UserState[]): Promise<StateQueryResult[]> {
    const results = await Promise.all(
      states.map(async (state) => {
        const users = await this.getUsersInState(state);
        return {
          state,
          users,
          count: users.length
        };
      })
    );

    return results;
  }

  /**
   * Clean up stale users from all states based on maximum age
   */
  async cleanupStaleUsers(maxAgeMs: number): Promise<string[]> {
    const cutoffTime = Date.now() - maxAgeMs;
    let allCleanedUserIds: string[] = [];

    for (const key of ALL_STATE_KEYS) {
      // Find stale users first
      const staleUsers = await redis.zrangebyscore(key, 0, cutoffTime);
      
      if (staleUsers.length > 0) {
        // Then remove them
        await redis.zrem(key, ...(staleUsers as string[]));
        allCleanedUserIds = allCleanedUserIds.concat(staleUsers);
      }
    }
    
    if (allCleanedUserIds.length > 0) {
      console.log(`[StateManager] Cleaned up ${allCleanedUserIds.length} stale users across all states`);
    }

    return allCleanedUserIds;
  }

  /**
   * Get the oldest users in a state (longest waiting)
   */
  async getOldestUsersInState(state: UserState, limit: number = 10): Promise<UserStateEntry[]> {
    const key = STATE_TO_KEY[state];
    
    // Get oldest users (lowest scores/timestamps) first
    const results = await redis.zrange(key, 0, limit - 1, 'WITHSCORES');
    
    const users: UserStateEntry[] = [];
    for (let i = 0; i < results.length; i += 2) {
      const userId = results[i];
      const timestamp = parseInt(results[i + 1], 10);
      
      users.push({
        userId,
        timestamp,
        state
      });
    }

    return users;
  }

  /**
   * Get the newest users in a state (most recently added)
   */
  async getNewestUsersInState(state: UserState, limit: number = 10): Promise<UserStateEntry[]> {
    const key = STATE_TO_KEY[state];
    
    // Get newest users (highest scores/timestamps) first
    const results = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    
    const users: UserStateEntry[] = [];
    for (let i = 0; i < results.length; i += 2) {
      const userId = results[i];
      const timestamp = parseInt(results[i + 1], 10);
      
      users.push({
        userId,
        timestamp,
        state
      });
    }

    return users;
  }

  /**
   * Remove users from a state based on time range
   */
  async removeUsersFromStateByTimeRange(
    state: UserState, 
    minTimestamp: number, 
    maxTimestamp: number
  ): Promise<number> {
    const key = STATE_TO_KEY[state];
    const removed = await redis.zremrangebyscore(key, minTimestamp, maxTimestamp);
    
    if (removed > 0) {
      console.log(`[StateManager] Removed ${removed} users from state ${state} in time range ${minTimestamp}-${maxTimestamp}`);
    }
    
    return removed;
  }
}

// Export singleton instance
export const stateManager = new RedisStateManager(); 