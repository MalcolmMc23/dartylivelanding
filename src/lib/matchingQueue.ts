import { stateManager } from './stateManager';
import { UserStateEntry } from './stateManager';

/**
 * Manages the user waiting queue for the matching engine.
 * Provides a clear, domain-specific API for FIFO queue operations
 * built on top of the generic RedisStateManager.
 */
export class MatchingQueueManager {
  /**
   * Adds a user to the waiting queue.
   * This corresponds to the user entering the 'WAITING' state.
   *
   * @param userId - The ID of the user to add.
   * @returns Promise<void>
   */
  async addUserToQueue(userId: string): Promise<void> {
    await stateManager.addUserToState(userId, 'WAITING');
    console.log(`[MatchingQueue] User ${userId} added to the waiting queue.`);
  }

  /**
   * Removes a user from the waiting queue.
   *
   * @param userId - The ID of the user to remove.
   * @returns Promise<boolean> - True if the user was removed, false otherwise.
   */
  async removeUserFromQueue(userId: string): Promise<boolean> {
    const removedCount = await stateManager.removeUserFromState(userId, 'WAITING');
    if (removedCount > 0) {
      console.log(`[MatchingQueue] User ${userId} removed from the waiting queue.`);
      return true;
    }
    return false;
  }

  /**
   * Retrieves the next users from the queue in FIFO order.
   *
   * @param count - The number of users to retrieve.
   * @returns Promise<UserStateEntry[]> - An array of user entries.
   */
  async getNextUsers(count: number): Promise<UserStateEntry[]> {
    return await stateManager.getOldestUsersInState('WAITING', count);
  }

  /**
   * Gets the current size of the waiting queue.
   *
   * @returns Promise<number> - The number of users in the queue.
   */
  async getQueueSize(): Promise<number> {
    return await stateManager.getUserCountInState('WAITING');
  }

  /**
   * Checks if a specific user is currently in the waiting queue.
   *
   * @param userId - The ID of the user to check.
   * @returns Promise<boolean> - True if the user is in the queue, false otherwise.
   */
  async isUserInQueue(userId: string): Promise<boolean> {
    return await stateManager.isUserInState(userId, 'WAITING');
  }

  /**
   * Removes multiple users from the queue in a single operation.
   * Useful for batch processing of matches.
   *
   * @param userIds - An array of user IDs to remove.
   * @returns Promise<number> - The number of users successfully removed.
   */
  async removeMultipleUsersFromQueue(userIds: string[]): Promise<number> {
    if (userIds.length === 0) {
      return 0;
    }
    const removedCount = await stateManager.removeUserFromState(userIds, 'WAITING');
    console.log(`[MatchingQueue] Attempted to remove ${userIds.length} users; ${removedCount} were actually removed.`);
    return removedCount;
  }
}

// Export a singleton instance
export const matchingQueueManager = new MatchingQueueManager(); 