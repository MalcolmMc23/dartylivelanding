import { stateManager, USER_STATES, UserState } from './stateManager';

// Event types for state transitions
export type StateTransitionEvent = {
  userId: string;
  fromState: UserState | null;
  toState: UserState;
  timestamp: number;
  metadata?: Record<string, unknown>;
  transactionId?: string;
};

export type StateTransitionError = {
  userId: string;
  fromState: UserState | null;
  toState: UserState;
  error: string;
  timestamp: number;
  transactionId?: string;
};

// Event listeners type
export type StateEventListener = (event: StateTransitionEvent | StateTransitionError) => void;

// Valid state transitions map
export const STATE_TRANSITIONS: Record<UserState, UserState[]> = {
  [USER_STATES.IDLE]: [USER_STATES.WAITING],
  [USER_STATES.WAITING]: [USER_STATES.CONNECTING, USER_STATES.IDLE], // Can go back to IDLE if user leaves
  [USER_STATES.CONNECTING]: [USER_STATES.IN_CALL, USER_STATES.WAITING], // Can fail back to WAITING
  [USER_STATES.IN_CALL]: [USER_STATES.DISCONNECTING],
  [USER_STATES.DISCONNECTING]: [USER_STATES.IDLE, USER_STATES.WAITING]
};

// Transaction tracking for rollbacks
interface StateTransaction {
  id: string;
  userId: string;
  fromState: UserState | null;
  toState: UserState;
  timestamp: number;
  completed: boolean;
  rolledBack: boolean;
}

/**
 * State Transition Manager
 * Handles validation, atomic transitions, rollbacks, and event emission
 */
export class StateTransitionManager {
  private eventListeners: {
    transition: StateEventListener[];
    error: StateEventListener[];
  } = {
    transition: [],
    error: []
  };
  
  private activeTransactions = new Map<string, StateTransaction>();
  
  /**
   * Validate if a state transition is allowed
   */
  public validateTransition(fromState: UserState | null, toState: UserState): boolean {
    // Allow any transition from null state (user not in any state)
    if (fromState === null) {
      return true;
    }
    
    // Check if transition is in allowed transitions map
    const allowedTransitions = STATE_TRANSITIONS[fromState];
    return allowedTransitions.includes(toState);
  }

  /**
   * Get all valid transitions from a given state
   */
  public getValidTransitions(fromState: UserState | null): UserState[] {
    if (fromState === null) {
      return Object.values(USER_STATES);
    }
    
    return STATE_TRANSITIONS[fromState] || [];
  }

  /**
   * Generate a unique transaction ID
   */
  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Perform an atomic state transition with validation and rollback support
   */
  public async performTransition(
    userId: string, 
    toState: UserState,
    metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    transactionId: string;
    fromState: UserState | null;
    error?: string;
  }> {
    const transactionId = this.generateTransactionId();
    const timestamp = Date.now();
    
    console.log(`[StateTransitions] Starting transition for user ${userId} to ${toState} (txn: ${transactionId})`);
    
    try {
      // Get current state
      const fromState = await stateManager.getUserCurrentState(userId);
      
      // Validate transition
      if (!this.validateTransition(fromState, toState)) {
        const error = `Invalid transition from ${fromState || 'null'} to ${toState}`;
        console.error(`[StateTransitions] ${error} (txn: ${transactionId})`);
        
        // Emit error event
        this.emitError({
          userId,
          fromState,
          toState,
          error,
          timestamp,
          transactionId
        });
        
        return {
          success: false,
          transactionId,
          fromState,
          error
        };
      }

      // Create transaction record
      const transaction: StateTransaction = {
        id: transactionId,
        userId,
        fromState,
        toState,
        timestamp,
        completed: false,
        rolledBack: false
      };
      
      this.activeTransactions.set(transactionId, transaction);

      // Perform the actual state transition
      let transitionSuccess = false;
      
      if (fromState === null) {
        // User not in any state, just add to target state
        await stateManager.addUserToState(userId, toState);
        transitionSuccess = true;
      } else {
        // Move from current state to target state
        transitionSuccess = await stateManager.moveUserBetweenStates(userId, fromState, toState);
      }

      if (!transitionSuccess) {
        const error = `Failed to perform Redis state transition from ${fromState} to ${toState}`;
        console.error(`[StateTransitions] ${error} (txn: ${transactionId})`);
        
        // Clean up transaction
        this.activeTransactions.delete(transactionId);
        
        // Emit error event
        this.emitError({
          userId,
          fromState,
          toState,
          error,
          timestamp,
          transactionId
        });
        
        return {
          success: false,
          transactionId,
          fromState,
          error
        };
      }

      // Mark transaction as completed
      transaction.completed = true;
      this.activeTransactions.set(transactionId, transaction);
      
      console.log(`[StateTransitions] Successfully transitioned user ${userId} from ${fromState} to ${toState} (txn: ${transactionId})`);
      
      // Emit success event
      this.emitTransition({
        userId,
        fromState,
        toState,
        timestamp,
        metadata,
        transactionId
      });
      
      // Clean up transaction after a delay (keep for potential rollback)
      setTimeout(() => {
        this.activeTransactions.delete(transactionId);
      }, 30000); // Keep for 30 seconds
      
      return {
        success: true,
        transactionId,
        fromState
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateTransitions] Exception during transition: ${errorMessage} (txn: ${transactionId})`);
      
      // Clean up transaction
      this.activeTransactions.delete(transactionId);
      
      // Emit error event
      this.emitError({
        userId,
        fromState: null,
        toState,
        error: errorMessage,
        timestamp,
        transactionId
      });
      
      return {
        success: false,
        transactionId,
        fromState: null,
        error: errorMessage
      };
    }
  }

  /**
   * Rollback a transaction (if possible and within time window)
   */
  public async rollbackTransaction(transactionId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      const error = `Transaction ${transactionId} not found or expired`;
      console.error(`[StateTransitions] ${error}`);
      return { success: false, error };
    }
    
    if (transaction.rolledBack) {
      const error = `Transaction ${transactionId} already rolled back`;
      console.warn(`[StateTransitions] ${error}`);
      return { success: false, error };
    }
    
    if (!transaction.completed) {
      const error = `Transaction ${transactionId} not completed, cannot rollback`;
      console.warn(`[StateTransitions] ${error}`);
      return { success: false, error };
    }

    console.log(`[StateTransitions] Rolling back transaction ${transactionId} for user ${transaction.userId}`);
    
    try {
      // Perform reverse transition
      let rollbackSuccess = false;
      
      if (transaction.fromState === null) {
        // Original state was null, remove from current state
        const removed = await stateManager.removeUserFromState(transaction.userId, transaction.toState);
        rollbackSuccess = removed > 0;
      } else {
        // Move back to original state
        rollbackSuccess = await stateManager.moveUserBetweenStates(
          transaction.userId, 
          transaction.toState, 
          transaction.fromState
        );
      }
      
      if (rollbackSuccess) {
        transaction.rolledBack = true;
        this.activeTransactions.set(transactionId, transaction);
        
        console.log(`[StateTransitions] Successfully rolled back transaction ${transactionId}`);
        
        // Emit rollback event (as a transition back to original state)
        if (transaction.fromState !== null) {
          this.emitTransition({
            userId: transaction.userId,
            fromState: transaction.toState,
            toState: transaction.fromState,
            timestamp: Date.now(),
            metadata: { rollback: true, originalTransactionId: transactionId },
            transactionId: `rollback_${transactionId}`
          });
        }
        
        return { success: true };
      } else {
        const error = `Failed to rollback Redis state for transaction ${transactionId}`;
        console.error(`[StateTransitions] ${error}`);
        return { success: false, error };
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateTransitions] Exception during rollback: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Perform multiple transitions atomically (all succeed or all fail)
   */
  public async performBatchTransitions(
    transitions: Array<{
      userId: string;
      toState: UserState;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<{
    success: boolean;
    transactionIds: string[];
    completedTransitions: number;
    error?: string;
  }> {
    const transactionIds: string[] = [];
    let completedTransitions = 0;
    
    console.log(`[StateTransitions] Starting batch transition for ${transitions.length} users`);
    
    try {
      // Perform all transitions
      for (const transition of transitions) {
        const result = await this.performTransition(
          transition.userId,
          transition.toState,
          transition.metadata
        );
        
        transactionIds.push(result.transactionId);
        
        if (result.success) {
          completedTransitions++;
        } else {
          // If any transition fails, rollback all completed ones
          console.error(`[StateTransitions] Batch transition failed at user ${transition.userId}, rolling back ${completedTransitions} completed transitions`);
          
          // Rollback in reverse order
          for (let i = completedTransitions - 1; i >= 0; i--) {
            await this.rollbackTransaction(transactionIds[i]);
          }
          
          return {
            success: false,
            transactionIds,
            completedTransitions: 0, // All rolled back
            error: result.error || 'Batch transaction failed'
          };
        }
      }
      
      console.log(`[StateTransitions] Successfully completed batch transition for ${completedTransitions} users`);
      
      return {
        success: true,
        transactionIds,
        completedTransitions
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateTransitions] Exception in batch transition: ${errorMessage}`);
      
      // Rollback all completed transitions
      for (let i = completedTransitions - 1; i >= 0; i--) {
        await this.rollbackTransaction(transactionIds[i]);
      }
      
      return {
        success: false,
        transactionIds,
        completedTransitions: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Force a user to a specific state (bypass validation - for admin/recovery)
   */
  public async forceTransition(
    userId: string,
    toState: UserState,
    metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    transactionId: string;
    fromState: UserState | null;
    forced: true;
  }> {
    const transactionId = this.generateTransactionId();
    const timestamp = Date.now();
    
    console.warn(`[StateTransitions] FORCE transition for user ${userId} to ${toState} (txn: ${transactionId})`);
    
    try {
      const fromState = await stateManager.getUserCurrentState(userId);
      
      // Remove from all states first, then add to target state
      await stateManager.removeUserFromAllStates(userId);
      await stateManager.addUserToState(userId, toState);
      
      // Emit forced transition event
      this.emitTransition({
        userId,
        fromState,
        toState,
        timestamp,
        metadata: { ...metadata, forced: true },
        transactionId
      });
      
      console.warn(`[StateTransitions] FORCE transition completed for user ${userId} (txn: ${transactionId})`);
      
      return {
        success: true,
        transactionId,
        fromState,
        forced: true
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateTransitions] Exception during force transition: ${errorMessage}`);
      
      this.emitError({
        userId,
        fromState: null,
        toState,
        error: errorMessage,
        timestamp,
        transactionId
      });
      
      return {
        success: false,
        transactionId,
        fromState: null,
        forced: true
      };
    }
  }

  /**
   * Add event listener for state transitions
   */
  public onTransition(listener: StateEventListener): void {
    this.eventListeners.transition.push(listener);
  }

  /**
   * Add event listener for state transition errors
   */
  public onError(listener: StateEventListener): void {
    this.eventListeners.error.push(listener);
  }

  /**
   * Remove event listener
   */
  public removeListener(type: 'transition' | 'error', listener: StateEventListener): void {
    const listeners = this.eventListeners[type];
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Emit transition event to all listeners
   */
  private emitTransition(event: StateTransitionEvent): void {
    this.eventListeners.transition.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[StateTransitions] Error in transition event listener:', error);
      }
    });
  }

  /**
   * Emit error event to all listeners
   */
  private emitError(event: StateTransitionError): void {
    this.eventListeners.error.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[StateTransitions] Error in error event listener:', error);
      }
    });
  }

  /**
   * Get active transaction details (for debugging)
   */
  public getActiveTransactions(): StateTransaction[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Get transaction details by ID
   */
  public getTransaction(transactionId: string): StateTransaction | undefined {
    return this.activeTransactions.get(transactionId);
  }

  /**
   * Clean up old transactions (manual cleanup)
   */
  public cleanupOldTransactions(maxAgeMs: number = 300000): number { // 5 minutes default
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;
    
    for (const [id, transaction] of this.activeTransactions) {
      if (transaction.timestamp < cutoff) {
        this.activeTransactions.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[StateTransitions] Cleaned up ${cleaned} old transactions`);
    }
    
    return cleaned;
  }

  /**
   * Validate current system state consistency
   */
  public async validateSystemState(): Promise<{
    valid: boolean;
    issues: Array<{
      userId: string;
      issue: string;
      states: UserState[];
    }>;
  }> {
    console.log('[StateTransitions] Validating system state consistency...');
    
    const issues: Array<{
      userId: string;
      issue: string;
      states: UserState[];
    }> = [];
    
    // Get all users across all states
    const allUsers = new Set<string>();
    const userStates = new Map<string, UserState[]>();
    
    for (const state of Object.values(USER_STATES)) {
      const users = await stateManager.getUsersInState(state);
      users.forEach(user => {
        allUsers.add(user.userId);
        if (!userStates.has(user.userId)) {
          userStates.set(user.userId, []);
        }
        userStates.get(user.userId)!.push(state);
      });
    }
    
    // Check for users in multiple states
    for (const [userId, states] of userStates) {
      if (states.length > 1) {
        issues.push({
          userId,
          issue: `User in multiple states: ${states.join(', ')}`,
          states
        });
      }
    }
    
    const valid = issues.length === 0;
    
    if (!valid) {
      console.warn(`[StateTransitions] Found ${issues.length} state consistency issues`);
      issues.forEach(issue => {
        console.warn(`[StateTransitions] Issue: ${issue.issue}`);
      });
    } else {
      console.log('[StateTransitions] System state is consistent');
    }
    
    return { valid, issues };
  }
}

// Export singleton instance
export const stateTransitionManager = new StateTransitionManager();

// Convenience functions that use the singleton
export const performTransition = (userId: string, toState: UserState, metadata?: Record<string, unknown>) =>
  stateTransitionManager.performTransition(userId, toState, metadata);

export const validateTransition = (fromState: UserState | null, toState: UserState) =>
  stateTransitionManager.validateTransition(fromState, toState);

export const rollbackTransaction = (transactionId: string) =>
  stateTransitionManager.rollbackTransaction(transactionId);

export const forceTransition = (userId: string, toState: UserState, metadata?: Record<string, unknown>) =>
  stateTransitionManager.forceTransition(userId, toState, metadata);

export const performBatchTransitions = (transitions: Array<{
  userId: string;
  toState: UserState;
  metadata?: Record<string, unknown>;
}>) => stateTransitionManager.performBatchTransitions(transitions); 