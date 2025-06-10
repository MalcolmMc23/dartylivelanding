import { USER_STATES, UserState, stateManager } from './stateManager';
import { stateTransitionManager, performTransition, validateTransition, StateTransitionError } from './stateTransitions';
import {
  getNextWaitingUsers,
  canUserBeMatched,
  areUsersInCall,
  getSystemStateOverview,
  cleanupStaleUsers
} from './stateOperations';

// High-level state machine operations result types
export interface StateMachineResult {
  success: boolean;
  error?: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
}

export interface MatchResult extends StateMachineResult {
  user1: string;
  user2: string;
  roomName?: string;
}

export interface BatchResult extends StateMachineResult {
  affectedUsers: string[];
  completedTransitions: number;
}

/**
 * High-Level State Machine for Omegle Matching System
 * Combines state management, transitions, and business logic
 */
export class OmegleStateMachine {

  /**
   * Initialize event logging for state transitions
   */
  constructor() {
    // Set up transition event logging
    stateTransitionManager.onTransition((event) => {
      console.log(`[StateMachine] Transition: ${event.userId} ${event.fromState} → ${event.toState} (${event.transactionId})`);
    });

    stateTransitionManager.onError((event) => {
      const errorEvent = event as StateTransitionError;
      console.error(`[StateMachine] Transition Error: ${errorEvent.userId} ${errorEvent.fromState} → ${errorEvent.toState}: ${errorEvent.error} (${errorEvent.transactionId})`);
    });
  }

  /**
   * User starts matching (landing page → queue)
   * IDLE → WAITING
   */
  async startMatching(userId: string): Promise<StateMachineResult> {
    console.log(`[StateMachine] User ${userId} starting matching`);
    
    try {
      const result = await performTransition(userId, USER_STATES.WAITING, {
        action: 'start_matching',
        timestamp: Date.now()
      });

      if (result.success) {
        console.log(`[StateMachine] User ${userId} successfully entered queue`);
        return {
          success: true,
          transactionId: result.transactionId,
          metadata: { fromState: result.fromState, toState: USER_STATES.WAITING }
        };
      } else {
        return {
          success: false,
          error: result.error,
          transactionId: result.transactionId
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateMachine] Error starting matching for ${userId}: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Create a match between two users
   * Both users: WAITING → CONNECTING
   */
  async createMatch(user1Id: string, user2Id: string, roomName: string): Promise<MatchResult> {
    console.log(`[StateMachine] Creating match between ${user1Id} and ${user2Id} in room ${roomName}`);
    
    try {
      // Validate both users can be matched
      const user1CanMatch = await canUserBeMatched(user1Id);
      const user2CanMatch = await canUserBeMatched(user2Id);
      
      if (!user1CanMatch || !user2CanMatch) {
        return {
          success: false,
          error: `Cannot match users: user1=${user1CanMatch}, user2=${user2CanMatch}`,
          user1: user1Id,
          user2: user2Id
        };
      }

      // Perform batch transition to CONNECTING state
      const batchResult = await stateTransitionManager.performBatchTransitions([
        {
          userId: user1Id,
          toState: USER_STATES.CONNECTING,
          metadata: { action: 'match_found', roomName, partnerId: user2Id }
        },
        {
          userId: user2Id,
          toState: USER_STATES.CONNECTING,
          metadata: { action: 'match_found', roomName, partnerId: user1Id }
        }
      ]);

      if (batchResult.success) {
        console.log(`[StateMachine] Successfully created match between ${user1Id} and ${user2Id}`);
        return {
          success: true,
          user1: user1Id,
          user2: user2Id,
          roomName,
          transactionId: batchResult.transactionIds[0], // Primary transaction ID
          metadata: {
            roomName,
            transactionIds: batchResult.transactionIds
          }
        };
      } else {
        return {
          success: false,
          error: batchResult.error,
          user1: user1Id,
          user2: user2Id
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateMachine] Error creating match: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        user1: user1Id,
        user2: user2Id
      };
    }
  }

  /**
   * Users successfully connect and enter call
   * Both users: CONNECTING → IN_CALL
   */
  async enterCall(user1Id: string, user2Id: string): Promise<MatchResult> {
    console.log(`[StateMachine] Users ${user1Id} and ${user2Id} entering call`);
    
    try {
      // Perform batch transition to IN_CALL state
      const batchResult = await stateTransitionManager.performBatchTransitions([
        {
          userId: user1Id,
          toState: USER_STATES.IN_CALL,
          metadata: { action: 'enter_call', partnerId: user2Id }
        },
        {
          userId: user2Id,
          toState: USER_STATES.IN_CALL,
          metadata: { action: 'enter_call', partnerId: user1Id }
        }
      ]);

      if (batchResult.success) {
        console.log(`[StateMachine] Users ${user1Id} and ${user2Id} successfully entered call`);
        return {
          success: true,
          user1: user1Id,
          user2: user2Id,
          transactionId: batchResult.transactionIds[0],
          metadata: {
            transactionIds: batchResult.transactionIds
          }
        };
      } else {
        return {
          success: false,
          error: batchResult.error,
          user1: user1Id,
          user2: user2Id
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateMachine] Error entering call: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        user1: user1Id,
        user2: user2Id
      };
    }
  }

  /**
   * Handle skip action - both users back to queue
   * Both users: IN_CALL → DISCONNECTING → WAITING
   */
  async handleSkip(user1Id: string, user2Id: string, initiatedBy: string): Promise<MatchResult> {
    console.log(`[StateMachine] Skip initiated by ${initiatedBy} for users ${user1Id} and ${user2Id}`);
    
    try {
      // Verify users are in call
      const usersInCall = await areUsersInCall(user1Id, user2Id);
      if (!usersInCall) {
        return {
          success: false,
          error: 'Users are not in a call together',
          user1: user1Id,
          user2: user2Id
        };
      }

      // Step 1: Move both to DISCONNECTING
      const disconnectResult = await stateTransitionManager.performBatchTransitions([
        {
          userId: user1Id,
          toState: USER_STATES.DISCONNECTING,
          metadata: { action: 'skip', initiatedBy, partnerId: user2Id }
        },
        {
          userId: user2Id,
          toState: USER_STATES.DISCONNECTING,
          metadata: { action: 'skip', initiatedBy, partnerId: user1Id }
        }
      ]);

      if (!disconnectResult.success) {
        return {
          success: false,
          error: disconnectResult.error,
          user1: user1Id,
          user2: user2Id
        };
      }

      // Brief delay for disconnection process
      await new Promise(resolve => setTimeout(resolve, 200));

      // Step 2: Move both to WAITING (back to queue)
      const requeueResult = await stateTransitionManager.performBatchTransitions([
        {
          userId: user1Id,
          toState: USER_STATES.WAITING,
          metadata: { action: 'requeue_after_skip', originalInitiator: initiatedBy }
        },
        {
          userId: user2Id,
          toState: USER_STATES.WAITING,
          metadata: { action: 'requeue_after_skip', originalInitiator: initiatedBy }
        }
      ]);

      if (requeueResult.success) {
        console.log(`[StateMachine] Successfully handled skip for users ${user1Id} and ${user2Id}`);
        return {
          success: true,
          user1: user1Id,
          user2: user2Id,
          transactionId: disconnectResult.transactionIds[0],
          metadata: {
            initiatedBy,
            disconnectTransactions: disconnectResult.transactionIds,
            requeueTransactions: requeueResult.transactionIds
          }
        };
      } else {
        // Requeue failed - try to rollback disconnect
        console.error(`[StateMachine] Requeue failed, attempting rollback for skip`);
        for (const txnId of disconnectResult.transactionIds) {
          await stateTransitionManager.rollbackTransaction(txnId);
        }
        
        return {
          success: false,
          error: `Skip failed during requeue: ${requeueResult.error}`,
          user1: user1Id,
          user2: user2Id
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateMachine] Error handling skip: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        user1: user1Id,
        user2: user2Id
      };
    }
  }

  /**
   * Handle end call action - ending user to IDLE, other user to WAITING
   * Ending user: IN_CALL → DISCONNECTING → IDLE
   * Other user: IN_CALL → DISCONNECTING → WAITING
   */
  async handleEndCall(endingUserId: string, otherUserId: string): Promise<MatchResult> {
    console.log(`[StateMachine] End call initiated by ${endingUserId}, other user: ${otherUserId}`);
    
    try {
      // Verify users are in call
      const usersInCall = await areUsersInCall(endingUserId, otherUserId);
      if (!usersInCall) {
        return {
          success: false,
          error: 'Users are not in a call together',
          user1: endingUserId,
          user2: otherUserId
        };
      }

      // Step 1: Move both to DISCONNECTING
      const disconnectResult = await stateTransitionManager.performBatchTransitions([
        {
          userId: endingUserId,
          toState: USER_STATES.DISCONNECTING,
          metadata: { action: 'end_call', role: 'initiator', partnerId: otherUserId }
        },
        {
          userId: otherUserId,
          toState: USER_STATES.DISCONNECTING,
          metadata: { action: 'end_call', role: 'other', partnerId: endingUserId }
        }
      ]);

      if (!disconnectResult.success) {
        return {
          success: false,
          error: disconnectResult.error,
          user1: endingUserId,
          user2: otherUserId
        };
      }

      // Brief delay for disconnection process
      await new Promise(resolve => setTimeout(resolve, 200));

      // Step 2: Move ending user to IDLE, other user to WAITING
      const finalResult = await stateTransitionManager.performBatchTransitions([
        {
          userId: endingUserId,
          toState: USER_STATES.IDLE,
          metadata: { action: 'end_session', role: 'ending_user' }
        },
        {
          userId: otherUserId,
          toState: USER_STATES.WAITING,
          metadata: { action: 'requeue_after_end', role: 'other_user' }
        }
      ]);

      if (finalResult.success) {
        console.log(`[StateMachine] Successfully handled end call: ${endingUserId} → IDLE, ${otherUserId} → WAITING`);
        return {
          success: true,
          user1: endingUserId,
          user2: otherUserId,
          transactionId: disconnectResult.transactionIds[0],
          metadata: {
            endingUser: endingUserId,
            requeuingUser: otherUserId,
            disconnectTransactions: disconnectResult.transactionIds,
            finalTransactions: finalResult.transactionIds
          }
        };
      } else {
        // Final transition failed - try to rollback disconnect
        console.error(`[StateMachine] Final transition failed, attempting rollback for end call`);
        for (const txnId of disconnectResult.transactionIds) {
          await stateTransitionManager.rollbackTransaction(txnId);
        }
        
        return {
          success: false,
          error: `End call failed during final transition: ${finalResult.error}`,
          user1: endingUserId,
          user2: otherUserId
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateMachine] Error handling end call: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        user1: endingUserId,
        user2: otherUserId
      };
    }
  }

  /**
   * Emergency cleanup for a user (remove from all states)
   */
  async emergencyCleanup(userId: string, reason: string): Promise<StateMachineResult> {
    console.warn(`[StateMachine] Emergency cleanup for user ${userId}: ${reason}`);
    
    try {
      const result = await stateTransitionManager.forceTransition(userId, USER_STATES.IDLE, {
        action: 'emergency_cleanup',
        reason,
        forced: true
      });

      if (result.success) {
        console.warn(`[StateMachine] Emergency cleanup completed for user ${userId}`);
        return {
          success: true,
          transactionId: result.transactionId,
          metadata: { reason, fromState: result.fromState, forced: true }
        };
      } else {
              return {
        success: false,
        error: `Emergency cleanup failed`,
        transactionId: result.transactionId
      };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateMachine] Error in emergency cleanup: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get next available users for matching
   */
  async getNextAvailableMatch(): Promise<{
    success: boolean;
    users?: string[];
    count: number;
    error?: string;
  }> {
    try {
      const waitingUsers = await getNextWaitingUsers(2);
      
      return {
        success: true,
        users: waitingUsers,
        count: waitingUsers.length
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateMachine] Error getting next match: ${errorMessage}`);
      return {
        success: false,
        count: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Validate if a transition is allowed for a user
   */
  async validateUserTransition(userId: string, toState: UserState): Promise<{
    valid: boolean;
    currentState: UserState | null;
    error?: string;
  }> {
    try {
      const currentState = await stateManager.getUserCurrentState(userId);
      const valid = validateTransition(currentState, toState);
      
      return {
        valid,
        currentState,
        error: valid ? undefined : `Invalid transition from ${currentState || 'null'} to ${toState}`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        currentState: null,
        error: errorMessage
      };
    }
  }

  /**
   * Get system state overview
   */
  async getSystemOverview() {
    try {
      const stats = await getSystemStateOverview();
      const validation = await stateTransitionManager.validateSystemState();
      const activeTransactions = stateTransitionManager.getActiveTransactions();
      
      return {
        success: true,
        states: stats,
        consistency: validation,
        activeTransactions: activeTransactions.length,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StateMachine] Error getting system overview: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Cleanup stale users and transactions
   */
  async performSystemCleanup(maxAgeMs: number = 5 * 60 * 1000): Promise<BatchResult> {
    const cleanupResult = await cleanupStaleUsers(maxAgeMs);
    
    if (cleanupResult.success) {
      return {
        success: true,
        affectedUsers: cleanupResult.cleanedUserIds,
        completedTransitions: cleanupResult.cleanedUserIds.length
      };
    } else {
      return {
        success: false,
        error: cleanupResult.error,
        affectedUsers: [],
        completedTransitions: 0
      };
    }
  }
}

// Create a singleton instance of the state machine
export const stateMachine = new OmegleStateMachine(); 