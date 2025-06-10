import { userMetadataManager, PartialUserMetadata } from './userMetadata';
import { stateTransitionManager, StateTransitionEvent, StateTransitionError } from './stateTransitions';
import { UserState } from './stateManager';

/**
 * Integration layer that automatically updates user metadata when state transitions occur
 * This ensures metadata stays in sync with state changes
 */
export class StateMetadataIntegration {
  private static instance: StateMetadataIntegration;
  private isInitialized = false;

  private constructor() {
    this.initializeEventListeners();
  }

  /**
   * Singleton pattern implementation
   */
  public static getInstance(): StateMetadataIntegration {
    if (!StateMetadataIntegration.instance) {
      StateMetadataIntegration.instance = new StateMetadataIntegration();
    }
    return StateMetadataIntegration.instance;
  }

  /**
   * Initialize event listeners for state transitions
   */
  private initializeEventListeners(): void {
    if (this.isInitialized) return;

    // Listen for successful state transitions
    stateTransitionManager.onTransition(async (event) => {
      try {
        await this.handleStateTransition(event);
      } catch (error) {
        console.error('[StateMetadataIntegration] Error handling state transition:', error);
      }
    });

    // Listen for state transition errors
    stateTransitionManager.onError(async (errorEvent) => {
      try {
        // Type guard: onError only emits StateTransitionError events
        if ('error' in errorEvent) {
          await this.handleStateTransitionError(errorEvent as StateTransitionError);
        }
      } catch (err) {
        console.error('[StateMetadataIntegration] Error handling state transition error:', err);
      }
    });

    this.isInitialized = true;
    console.log('[StateMetadataIntegration] Event listeners initialized');
  }

  /**
   * Handle successful state transitions by updating user metadata
   */
  private async handleStateTransition(event: StateTransitionEvent): Promise<void> {
    const { userId, fromState, toState, timestamp, metadata: eventMetadata, transactionId } = event;

    // Prepare metadata updates based on state transition
    const metadataUpdates: PartialUserMetadata = {
      state: toState,
      previousState: fromState || undefined,
      lastStateChange: timestamp,
      lastActivity: timestamp,
      isActive: true,
      ...this.getStateSpecificMetadata(toState, eventMetadata)
    };

    // Update action tracking based on state transition
    const actionInfo = this.getActionFromStateTransition(fromState, toState);
    if (actionInfo) {
      metadataUpdates.lastAction = actionInfo.action;
      metadataUpdates.lastActionTime = timestamp;
      
      // Update counters
      if (actionInfo.action === 'skip') {
        const currentMetadata = await userMetadataManager.getUserMetadata(userId);
        metadataUpdates.totalSkips = (currentMetadata?.totalSkips || 0) + 1;
      } else if (actionInfo.action === 'end') {
        const currentMetadata = await userMetadataManager.getUserMetadata(userId);
        metadataUpdates.totalEnds = (currentMetadata?.totalEnds || 0) + 1;
      } else if (actionInfo.action === 'match') {
        const currentMetadata = await userMetadataManager.getUserMetadata(userId);
        metadataUpdates.totalMatches = (currentMetadata?.totalMatches || 0) + 1;
      }
    }

    // Initialize user if they don't exist
    const existingMetadata = await userMetadataManager.getUserMetadata(userId);
    if (!existingMetadata) {
      await userMetadataManager.initializeUser(userId, toState, metadataUpdates);
      console.log(`[StateMetadataIntegration] Initialized new user ${userId} in state ${toState} (txn: ${transactionId})`);
    } else {
      await userMetadataManager.updateUserMetadata(userId, metadataUpdates);
      console.log(`[StateMetadataIntegration] Updated user ${userId} metadata for transition ${fromState} → ${toState} (txn: ${transactionId})`);
    }
  }

  /**
   * Handle state transition errors by updating metadata with error information
   */
  private async handleStateTransitionError(error: StateTransitionError): Promise<void> {
    const { userId, error: errorMessage, timestamp, transactionId } = error;

    // Update metadata to reflect the error
    const metadataUpdates: PartialUserMetadata = {
      lastActivity: timestamp,
      // Could add error tracking fields here if needed
    };

    try {
      await userMetadataManager.updateUserMetadata(userId, metadataUpdates);
      console.log(`[StateMetadataIntegration] Updated user ${userId} metadata after transition error (txn: ${transactionId}): ${errorMessage}`);
    } catch (updateError) {
      console.error(`[StateMetadataIntegration] Failed to update metadata for user ${userId} after error:`, updateError);
    }
  }

  /**
   * Get state-specific metadata based on the target state
   */
  private getStateSpecificMetadata(
    toState: UserState, 
    eventMetadata?: Record<string, unknown>
  ): PartialUserMetadata {
    const updates: PartialUserMetadata = {};

    switch (toState) {
      case 'IDLE':
        // Clear room and matching information when going idle
        updates.currentRoom = undefined;
        updates.matchedWith = undefined;
        updates.roomJoinTime = undefined;
        break;

      case 'WAITING':
        // Clear room information but keep some session data
        updates.currentRoom = undefined;
        updates.roomJoinTime = undefined;
        // matchedWith might be kept for analytics
        break;

      case 'CONNECTING':
        // Set room join time when connecting
        updates.roomJoinTime = Date.now();
        if (eventMetadata?.roomName) {
          updates.currentRoom = eventMetadata.roomName as string;
        }
        if (eventMetadata?.matchedWith) {
          updates.matchedWith = eventMetadata.matchedWith as string;
        }
        break;

      case 'IN_CALL':
        // Ensure room information is set
        if (eventMetadata?.roomName) {
          updates.currentRoom = eventMetadata.roomName as string;
        }
        if (eventMetadata?.matchedWith) {
          updates.matchedWith = eventMetadata.matchedWith as string;
        }
        break;

      case 'DISCONNECTING':
        // Keep room information during disconnection for cleanup
        break;
    }

    return updates;
  }

  /**
   * Determine the action type based on state transition
   */
  private getActionFromStateTransition(
    fromState: UserState | null, 
    toState: UserState
  ): { action: 'skip' | 'end' | 'match' | 'queue' | 'disconnect' } | null {
    // IDLE → WAITING: User starts queuing
    if (fromState === 'IDLE' && toState === 'WAITING') {
      return { action: 'queue' };
    }

    // WAITING → CONNECTING: Match found
    if (fromState === 'WAITING' && toState === 'CONNECTING') {
      return { action: 'match' };
    }

    // IN_CALL → DISCONNECTING: User initiated disconnect (could be skip or end)
    if (fromState === 'IN_CALL' && toState === 'DISCONNECTING') {
      return { action: 'disconnect' };
    }

    // DISCONNECTING → WAITING: Skip (both users back to queue)
    if (fromState === 'DISCONNECTING' && toState === 'WAITING') {
      return { action: 'skip' };
    }

    // DISCONNECTING → IDLE: End (user leaves system)
    if (fromState === 'DISCONNECTING' && toState === 'IDLE') {
      return { action: 'end' };
    }

    return null;
  }

  /**
   * Manually sync a user's metadata with their current state
   * Useful for recovery or migration scenarios
   */
  public async syncUserMetadata(
    userId: string, 
    additionalMetadata?: PartialUserMetadata
  ): Promise<boolean> {
    try {
      // Get current state from state manager
      const currentState = await userMetadataManager.getUserState(userId);
      
      if (!currentState) {
        console.warn(`[StateMetadataIntegration] No state found for user ${userId} during sync`);
        return false;
      }

      // Update metadata to match current state
      const updates: PartialUserMetadata = {
        state: currentState,
        lastActivity: Date.now(),
        isActive: true,
        ...additionalMetadata
      };

      await userMetadataManager.updateUserMetadata(userId, updates);
      console.log(`[StateMetadataIntegration] Synced metadata for user ${userId} with state ${currentState}`);
      return true;
    } catch (error) {
      console.error(`[StateMetadataIntegration] Failed to sync metadata for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Enhanced heartbeat that updates both state tracking and metadata
   */
  public async enhancedHeartbeat(
    userId: string, 
    additionalMetadata?: PartialUserMetadata
  ): Promise<boolean> {
    try {
      // Update heartbeat in metadata system
      const success = await userMetadataManager.updateHeartbeat(userId, additionalMetadata);
      
      if (success) {
        console.log(`[StateMetadataIntegration] Enhanced heartbeat updated for user ${userId}`);
      }
      
      return success;
    } catch (error) {
      console.error(`[StateMetadataIntegration] Enhanced heartbeat failed for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Clean up metadata for users who are no longer in any state
   */
  public async cleanupOrphanedMetadata(): Promise<number> {
    try {
      // This would require scanning all metadata and checking against state manager
      // For now, we'll use the built-in cleanup with a reasonable age limit
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      const cleanedCount = await userMetadataManager.cleanupStaleUsers(maxAge);
      
      if (cleanedCount > 0) {
        console.log(`[StateMetadataIntegration] Cleaned up ${cleanedCount} orphaned metadata records`);
      }
      
      return cleanedCount;
    } catch (error) {
      console.error('[StateMetadataIntegration] Failed to cleanup orphaned metadata:', error);
      return 0;
    }
  }
}

// Create and export singleton instance
export const stateMetadataIntegration = StateMetadataIntegration.getInstance();

// Export convenience functions
export const syncUserMetadata = (userId: string, additionalMetadata?: PartialUserMetadata) =>
  stateMetadataIntegration.syncUserMetadata(userId, additionalMetadata);

export const enhancedHeartbeat = (userId: string, additionalMetadata?: PartialUserMetadata) =>
  stateMetadataIntegration.enhancedHeartbeat(userId, additionalMetadata);

export const cleanupOrphanedMetadata = () =>
  stateMetadataIntegration.cleanupOrphanedMetadata(); 