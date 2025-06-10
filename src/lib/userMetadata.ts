import redis from './redis';
import { USER_STATES, UserState } from './stateManager';

// User metadata schema
export interface UserMetadata {
  // State tracking
  state: UserState;
  lastStateChange: number;
  previousState?: UserState;
  
  // Heartbeat and activity
  lastHeartbeat: number;
  lastActivity: number;
  sessionStartTime: number;
  
  // Matching and room information
  currentRoom?: string;
  matchedWith?: string;
  roomJoinTime?: number;
  
  // Action tracking
  lastAction?: 'skip' | 'end' | 'match' | 'queue' | 'disconnect';
  lastActionTime?: number;
  
  // Session statistics
  totalMatches: number;
  totalSkips: number;
  totalEnds: number;
  averageCallDuration?: number;
  
  // System flags
  isActive: boolean;
  gracePeriod?: number; // Timestamp until which user is protected from cleanup
  pendingTransition?: boolean;
  
  // Admin and debugging
  lastIP?: string;
  userAgent?: string;
  createdAt: number;
  updatedAt: number;
}

// Partial metadata for updates
export type PartialUserMetadata = Partial<UserMetadata>;

// Metadata query options
export interface MetadataQueryOptions {
  includeInactive?: boolean;
  stateFilter?: UserState[];
  ageLimit?: number; // Max age in milliseconds
  gracePeriodOnly?: boolean;
}

// Batch operation result
export interface BatchOperationResult {
  successful: string[];
  failed: Array<{ userId: string; error: string }>;
  totalProcessed: number;
}

// Default TTL for user metadata (24 hours)
const DEFAULT_METADATA_TTL = 24 * 60 * 60; // 24 hours in seconds

// Grace period TTL (30 seconds - used for immediate re-queue protection)
const GRACE_PERIOD_TTL = 30; // 30 seconds

/**
 * User Metadata Manager for comprehensive user data storage and retrieval
 * Uses Redis Hashes for efficient metadata operations with TTL support
 */
export class UserMetadataManager {
  
  /**
   * Get the Redis key for user metadata
   */
  private getUserKey(userId: string): string {
    return `user:${userId}`;
  }

  /**
   * Get the Redis key for user heartbeat (for backwards compatibility)
   */
  private getHeartbeatKey(userId: string): string {
    return `heartbeat:${userId}`;
  }

  /**
   * Create default metadata for a new user
   */
  private createDefaultMetadata(
    userId: string, 
    initialState: UserState = USER_STATES.IDLE,
    additionalData?: PartialUserMetadata
  ): UserMetadata {
    const now = Date.now();
    
    return {
      state: initialState,
      lastStateChange: now,
      lastHeartbeat: now,
      lastActivity: now,
      sessionStartTime: now,
      totalMatches: 0,
      totalSkips: 0,
      totalEnds: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...additionalData
    };
  }

  /**
   * Set complete user metadata
   */
  async setUserMetadata(
    userId: string, 
    metadata: UserMetadata, 
    ttl: number = DEFAULT_METADATA_TTL
  ): Promise<void> {
    const userKey = this.getUserKey(userId);
    const heartbeatKey = this.getHeartbeatKey(userId);
    
    // Convert all fields to strings for Redis hash storage
    const metadataForStorage: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null) {
        metadataForStorage[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
    
    // Store metadata in hash using multiple hset calls and set TTL
    const hsetPromises = Object.entries(metadataForStorage).map(([field, value]) =>
      redis.hset(userKey, field, value)
    );
    
    await Promise.all([
      ...hsetPromises,
      redis.expire(userKey, ttl),
      // Maintain backwards compatibility with heartbeat system
      redis.setex(heartbeatKey, Math.min(ttl, 30), metadata.lastHeartbeat.toString())
    ]);
    
    console.log(`[UserMetadata] Set metadata for user ${userId} with TTL ${ttl}s`);
  }

  /**
   * Get complete user metadata
   */
  async getUserMetadata(userId: string): Promise<UserMetadata | null> {
    const userKey = this.getUserKey(userId);
    const rawData = await redis.hgetall(userKey);
    
    if (!rawData || Object.keys(rawData).length === 0) {
      return null;
    }
    
    // Parse the data back to proper types
    const metadata: Partial<UserMetadata> = {};
    
    for (const [key, value] of Object.entries(rawData)) {
      if (value) {
                 try {
           // Try to parse as JSON first (for complex types)
           if (value.startsWith('{') || value.startsWith('[') || value === 'true' || value === 'false') {
             (metadata as Record<string, unknown>)[key] = JSON.parse(value);
           } else if (!isNaN(Number(value))) {
             // Parse numbers
             (metadata as Record<string, unknown>)[key] = Number(value);
           } else {
             // Keep as string
             (metadata as Record<string, unknown>)[key] = value;
           }
         } catch {
           // If parsing fails, keep as string
           (metadata as Record<string, unknown>)[key] = value;
         }
      }
    }
    
    return metadata as UserMetadata;
  }

  /**
   * Update specific metadata fields
   */
  async updateUserMetadata(
    userId: string, 
    updates: PartialUserMetadata,
    ttl: number = DEFAULT_METADATA_TTL
  ): Promise<boolean> {
    const userKey = this.getUserKey(userId);
    const heartbeatKey = this.getHeartbeatKey(userId);
    
    // Always update the updatedAt timestamp
    const updatesWithTimestamp = {
      ...updates,
      updatedAt: Date.now()
    };
    
    // Convert updates to strings for Redis storage
    const updatesForStorage: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(updatesWithTimestamp)) {
      if (value !== undefined && value !== null) {
        updatesForStorage[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
    
    try {
      // Store updates using multiple hset calls
      const hsetPromises = Object.entries(updatesForStorage).map(([field, value]) =>
        redis.hset(userKey, field, value)
      );
      
      const results = await Promise.all([
        ...hsetPromises,
        redis.expire(userKey, ttl),
        // Update heartbeat if lastHeartbeat was updated
        updates.lastHeartbeat ? 
          redis.setex(heartbeatKey, Math.min(ttl, 30), updates.lastHeartbeat.toString()) :
          Promise.resolve()
      ]);
      
      const fieldsUpdated = results[0];
      console.log(`[UserMetadata] Updated ${fieldsUpdated} fields for user ${userId}`);
      return true;
    } catch (error) {
      console.error(`[UserMetadata] Failed to update metadata for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Update user heartbeat (enhanced version)
   */
  async updateHeartbeat(userId: string, additionalMetadata?: PartialUserMetadata): Promise<boolean> {
    const now = Date.now();
    
    const updates: PartialUserMetadata = {
      lastHeartbeat: now,
      lastActivity: now,
      isActive: true,
      ...additionalMetadata
    };
    
    return this.updateUserMetadata(userId, updates);
  }

  /**
   * Update user state and related metadata
   */
  async updateUserState(
    userId: string, 
    newState: UserState, 
    additionalMetadata?: PartialUserMetadata
  ): Promise<boolean> {
    const currentMetadata = await this.getUserMetadata(userId);
    const now = Date.now();
    
    const updates: PartialUserMetadata = {
      previousState: currentMetadata?.state,
      state: newState,
      lastStateChange: now,
      lastActivity: now,
      ...additionalMetadata
    };
    
    return this.updateUserMetadata(userId, updates);
  }

  /**
   * Create or initialize user metadata
   */
  async initializeUser(
    userId: string, 
    initialState: UserState = USER_STATES.IDLE,
    additionalData?: PartialUserMetadata
  ): Promise<UserMetadata> {
    const metadata = this.createDefaultMetadata(userId, initialState, additionalData);
    await this.setUserMetadata(userId, metadata);
    return metadata;
  }

  /**
   * Check if user exists and is active
   */
  async isUserActive(userId: string): Promise<boolean> {
    const metadata = await this.getUserMetadata(userId);
    return metadata !== null && metadata.isActive;
  }

  /**
   * Get user's current state from metadata
   */
  async getUserState(userId: string): Promise<UserState | null> {
    const metadata = await this.getUserMetadata(userId);
    return metadata?.state || null;
  }

  /**
   * Set grace period for a user (prevents cleanup)
   */
  async setGracePeriod(userId: string, durationSeconds: number = GRACE_PERIOD_TTL): Promise<void> {
    const gracePeriodEnd = Date.now() + (durationSeconds * 1000);
    
    await this.updateUserMetadata(userId, {
      gracePeriod: gracePeriodEnd
    });
    
    // Also set the backwards compatible grace period key
    await redis.setex(`requeue-grace:${userId}`, durationSeconds, 'true');
    
    console.log(`[UserMetadata] Set grace period for user ${userId} until ${new Date(gracePeriodEnd).toISOString()}`);
  }

  /**
   * Check if user is in grace period
   */
  async isInGracePeriod(userId: string): Promise<boolean> {
    const metadata = await this.getUserMetadata(userId);
    
    if (!metadata?.gracePeriod) {
      return false;
    }
    
    const now = Date.now();
    return metadata.gracePeriod > now;
  }

  /**
   * Remove user metadata completely
   */
  async removeUser(userId: string): Promise<boolean> {
    const userKey = this.getUserKey(userId);
    const heartbeatKey = this.getHeartbeatKey(userId);
    
    try {
      await Promise.all([
        redis.del(userKey),
        redis.del(heartbeatKey),
        redis.del(`requeue-grace:${userId}`)
      ]);
      
      console.log(`[UserMetadata] Removed all data for user ${userId}`);
      return true;
    } catch (error) {
      console.error(`[UserMetadata] Failed to remove user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get metadata for multiple users (batch operation)
   */
  async getBatchUserMetadata(userIds: string[]): Promise<Map<string, UserMetadata | null>> {
    const results = new Map<string, UserMetadata | null>();
    
    // Process in batches to avoid overwhelming Redis
    const batchSize = 50;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (userId) => {
        const metadata = await this.getUserMetadata(userId);
        return { userId, metadata };
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const { userId, metadata } of batchResults) {
        results.set(userId, metadata);
      }
    }
    
    return results;
  }

  /**
   * Update metadata for multiple users (batch operation)
   */
  async batchUpdateMetadata(
    updates: Array<{ userId: string; metadata: PartialUserMetadata }>,
    ttl: number = DEFAULT_METADATA_TTL
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      successful: [],
      failed: [],
      totalProcessed: updates.length
    };
    
    // Process in smaller batches to avoid overwhelming Redis
    const batchSize = 25;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async ({ userId, metadata }) => {
        try {
          const success = await this.updateUserMetadata(userId, metadata, ttl);
          if (success) {
            result.successful.push(userId);
          } else {
            result.failed.push({ userId, error: 'Update operation failed' });
          }
        } catch (error) {
          result.failed.push({ 
            userId, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    console.log(`[UserMetadata] Batch update completed: ${result.successful.length} successful, ${result.failed.length} failed`);
    return result;
  }

  /**
   * Find users by metadata criteria
   */
  async findUsersByMetadata(
    criteria: PartialUserMetadata,
    options: MetadataQueryOptions = {}
  ): Promise<UserMetadata[]> {
    // This is a simplified implementation - in a larger system, you'd want proper indexing
    // For now, we'll scan through user keys (this could be expensive with many users)
    
    const pattern = 'user:*';
    const keys = await redis.keys(pattern);
    
    const results: UserMetadata[] = [];
    
    // Process in batches
    const batchSize = 50;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (key: string) => {
        const userId = key.replace('user:', '');
        const metadata = await this.getUserMetadata(userId);
        
        if (!metadata) return null;
        
        // Apply filters
        if (!options.includeInactive && !metadata.isActive) return null;
        if (options.stateFilter && !options.stateFilter.includes(metadata.state)) return null;
        if (options.ageLimit && (Date.now() - metadata.createdAt) > options.ageLimit) return null;
        if (options.gracePeriodOnly && !await this.isInGracePeriod(userId)) return null;
        
        // Check if metadata matches criteria
        for (const [key, value] of Object.entries(criteria)) {
          if (metadata[key as keyof UserMetadata] !== value) {
            return null;
          }
        }
        
        return metadata;
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const metadata of batchResults) {
        if (metadata) {
          results.push(metadata);
        }
      }
    }
    
    return results;
  }

  /**
   * Clean up stale user metadata
   */
  async cleanupStaleUsers(maxAgeMs: number): Promise<number> {
    const cutoffTime = Date.now() - maxAgeMs;
    const pattern = 'user:*';
    const keys = await redis.keys(pattern);
    
    let cleanedCount = 0;
    
    // Process in batches
    const batchSize = 50;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      const cleanupPromises = batch.map(async (key: string) => {
        const userId = key.replace('user:', '');
        const metadata = await this.getUserMetadata(userId);
        
        if (!metadata) return false;
        
        // Check if user should be cleaned up
        const shouldCleanup = 
          metadata.lastActivity < cutoffTime && 
          !metadata.isActive &&
          !await this.isInGracePeriod(userId);
        
        if (shouldCleanup) {
          await this.removeUser(userId);
          return true;
        }
        
        return false;
      });
      
      const batchResults = await Promise.all(cleanupPromises);
      cleanedCount += batchResults.filter(Boolean).length;
    }
    
    if (cleanedCount > 0) {
      console.log(`[UserMetadata] Cleaned up ${cleanedCount} stale users`);
    }
    
    return cleanedCount;
  }

  /**
   * Get system statistics
   */
  async getSystemStatistics(): Promise<{
    totalUsers: number;
    activeUsers: number;
    usersByState: Record<UserState, number>;
    usersInGracePeriod: number;
  }> {
    const pattern = 'user:*';
    const keys = await redis.keys(pattern);
    
    const stats = {
      totalUsers: keys.length,
      activeUsers: 0,
      usersByState: {} as Record<UserState, number>,
      usersInGracePeriod: 0
    };
    
    // Initialize state counts
    for (const state of Object.values(USER_STATES)) {
      stats.usersByState[state] = 0;
    }
    
    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (key: string) => {
        const userId = key.replace('user:', '');
        const metadata = await this.getUserMetadata(userId);
        
        if (!metadata) return;
        
        if (metadata.isActive) {
          stats.activeUsers++;
        }
        
        stats.usersByState[metadata.state]++;
        
        if (await this.isInGracePeriod(userId)) {
          stats.usersInGracePeriod++;
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    return stats;
  }
}

// Create singleton instance
export const userMetadataManager = new UserMetadataManager();

// Export convenience functions
export const getUserMetadata = (userId: string) => userMetadataManager.getUserMetadata(userId);
export const updateUserMetadata = (userId: string, updates: PartialUserMetadata) => 
  userMetadataManager.updateUserMetadata(userId, updates);
export const updateHeartbeat = (userId: string, additionalMetadata?: PartialUserMetadata) => 
  userMetadataManager.updateHeartbeat(userId, additionalMetadata);
export const updateUserState = (userId: string, newState: UserState, additionalMetadata?: PartialUserMetadata) => 
  userMetadataManager.updateUserState(userId, newState, additionalMetadata);
export const initializeUser = (userId: string, initialState?: UserState, additionalData?: PartialUserMetadata) => 
  userMetadataManager.initializeUser(userId, initialState, additionalData);
export const isUserActive = (userId: string) => userMetadataManager.isUserActive(userId);
export const getUserState = (userId: string) => userMetadataManager.getUserState(userId);
export const setGracePeriod = (userId: string, durationSeconds?: number) => 
  userMetadataManager.setGracePeriod(userId, durationSeconds);
export const removeUser = (userId: string) => userMetadataManager.removeUser(userId); 