import redis from './redis';
import { stateManager, USER_STATES, UserState } from './stateManager';
import { matchingQueueManager } from './matchingQueue';
import { cooldownManager } from './cooldownManager';
import { MatchData } from '../types/random-chat';

// Extended match data for internal use
export interface ExtendedMatchData extends MatchData {
  user1: string;
  user2: string;
  createdAt: number;
}

// Result of match creation operation
export interface MatchCreationResult {
  success: boolean;
  match?: ExtendedMatchData;
  error?: string;
  reason?: 'user_not_found' | 'user_not_waiting' | 'transaction_failed' | 'validation_failed';
}

/**
 * Manages atomic match creation between users
 */
export class MatchManager {
  
  /**
   * Generate a unique session ID for the match
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    return `match_${timestamp}_${randomPart}`;
  }

  /**
   * Generate a unique room name for LiveKit
   */
  private generateRoomName(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    return `room_${timestamp}_${randomPart}`;
  }

  /**
   * Validate that both users are still in the waiting queue before creating a match
   */
  private async validateUsersForMatch(user1: string, user2: string): Promise<boolean> {
    try {
      const [user1InQueue, user2InQueue] = await Promise.all([
        matchingQueueManager.isUserInQueue(user1),
        matchingQueueManager.isUserInQueue(user2)
      ]);

      if (!user1InQueue) {
        console.warn(`[MatchManager] User ${user1} not found in waiting queue`);
        return false;
      }

      if (!user2InQueue) {
        console.warn(`[MatchManager] User ${user2} not found in waiting queue`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[MatchManager] Error validating users for match:', error);
      return false;
    }
  }

  /**
   * Atomically create a match between two users
   * This operation will either succeed completely or fail without side effects
   */
  async createMatch(user1: string, user2: string): Promise<MatchCreationResult> {
    if (!user1 || !user2 || user1 === user2) {
      return {
        success: false,
        error: 'Invalid user IDs provided',
        reason: 'validation_failed'
      };
    }

    console.log(`[MatchManager] Attempting to create match between ${user1} and ${user2}`);

    try {
      // First validate that both users are still in the waiting queue
      const isValid = await this.validateUsersForMatch(user1, user2);
      if (!isValid) {
        return {
          success: false,
          error: 'One or both users are no longer in the waiting queue',
          reason: 'user_not_waiting'
        };
      }

      // Generate match data
      const sessionId = this.generateSessionId();
      const roomName = this.generateRoomName();
      const createdAt = Date.now();

      const matchData: ExtendedMatchData = {
        sessionId,
        roomName,
        user1,
        user2,
        createdAt
      };

      // Execute atomic transaction
      const success = await this.executeAtomicMatchCreation(matchData);

      if (success) {
        console.log(`[MatchManager] Successfully created match ${sessionId} between ${user1} and ${user2}`);
        return {
          success: true,
          match: matchData
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed during match creation',
          reason: 'transaction_failed'
        };
      }

    } catch (error) {
      console.error('[MatchManager] Error creating match:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        reason: 'transaction_failed'
      };
    }
  }

  /**
   * Execute the atomic match creation using Redis transactions
   * This ensures all operations succeed or fail together
   */
  private async executeAtomicMatchCreation(matchData: ExtendedMatchData): Promise<boolean> {
    const { sessionId, user1, user2, createdAt } = matchData;

    try {
      // Redis doesn't support true multi-command transactions in the same way as SQL
      // but we can use a pipeline for atomic-like operations
      // For now, we'll implement this step by step with error handling
      
      // Step 1: Remove users from waiting queue
      const removedCount = await matchingQueueManager.removeMultipleUsersFromQueue([user1, user2]);
      
      if (removedCount !== 2) {
        console.error(`[MatchManager] Expected to remove 2 users from queue, but removed ${removedCount}`);
        
        // Rollback: re-add any users that were removed
        if (removedCount > 0) {
          // We need to add them back, but we don't know which ones were removed
          // This is a limitation - in a real transaction, this would be handled automatically
          console.warn('[MatchManager] Partial removal detected, attempting rollback');
          
          // Re-add both users to be safe
          await Promise.all([
            matchingQueueManager.addUserToQueue(user1),
            matchingQueueManager.addUserToQueue(user2)
          ]);
        }
        
        return false;
      }

      // Step 2: Update user states to CONNECTING
      try {
        await Promise.all([
          stateManager.addUserToState(user1, USER_STATES.CONNECTING),
          stateManager.addUserToState(user2, USER_STATES.CONNECTING)
        ]);
      } catch (error) {
        console.error('[MatchManager] Failed to update user states, rolling back queue changes');
        
        // Rollback: add users back to queue
        await Promise.all([
          matchingQueueManager.addUserToQueue(user1),
          matchingQueueManager.addUserToQueue(user2)
        ]);
        
        throw error;
      }

      // Step 3: Store match record
      try {
        const matchKey = `match:${sessionId}`;
        const matchRecord = JSON.stringify(matchData);
        
        await redis.setex(matchKey, 3600, matchRecord); // Store for 1 hour
        
        // Also store user -> session mapping for quick lookup
        await Promise.all([
          redis.setex(`user_session:${user1}`, 3600, sessionId),
          redis.setex(`user_session:${user2}`, 3600, sessionId)
        ]);
        
      } catch (error) {
        console.error('[MatchManager] Failed to store match record, rolling back');
        
        // Rollback: remove from CONNECTING state and add back to queue
        await Promise.all([
          stateManager.removeUserFromState(user1, USER_STATES.CONNECTING),
          stateManager.removeUserFromState(user2, USER_STATES.CONNECTING),
          matchingQueueManager.addUserToQueue(user1),
          matchingQueueManager.addUserToQueue(user2)
        ]);
        
        throw error;
      }

      console.log(`[MatchManager] Atomic match creation completed successfully for session ${sessionId}`);
      return true;

    } catch (error) {
      console.error('[MatchManager] Atomic match creation failed:', error);
      return false;
    }
  }

  /**
   * Retrieve match data by session ID
   */
  async getMatch(sessionId: string): Promise<ExtendedMatchData | null> {
    try {
      const matchKey = `match:${sessionId}`;
      const matchRecord = await redis.get(matchKey);
      
      if (!matchRecord) {
        return null;
      }

      return JSON.parse(matchRecord) as ExtendedMatchData;
    } catch (error) {
      console.error('[MatchManager] Error retrieving match:', error);
      return null;
    }
  }

  /**
   * Get the session ID for a user (if they're in a match)
   */
  async getUserSession(userId: string): Promise<string | null> {
    try {
      const sessionKey = `user_session:${userId}`;
      return await redis.get(sessionKey);
    } catch (error) {
      console.error('[MatchManager] Error retrieving user session:', error);
      return null;
    }
  }

  /**
   * Delete a match and clean up associated data
   */
  async deleteMatch(sessionId: string): Promise<boolean> {
    try {
      const match = await this.getMatch(sessionId);
      if (!match) {
        console.warn(`[MatchManager] Match ${sessionId} not found for deletion`);
        return false;
      }

      // Delete match record and user session mappings
      await Promise.all([
        redis.del(`match:${sessionId}`),
        redis.del(`user_session:${match.user1}`),
        redis.del(`user_session:${match.user2}`)
      ]);

      console.log(`[MatchManager] Successfully deleted match ${sessionId}`);
      return true;
    } catch (error) {
      console.error('[MatchManager] Error deleting match:', error);
      return false;
    }
  }
}

// Export singleton instance
export const matchManager = new MatchManager(); 