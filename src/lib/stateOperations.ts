import { stateManager, USER_STATES, UserState } from './stateManager';

/**
 * Common state operation utilities for the Omegle matching system
 * Provides high-level functions for typical state transitions
 */

/**
 * Move user from IDLE to WAITING state (user starts matching)
 */
export async function userStartsMatching(userId: string): Promise<boolean> {
  console.log(`[StateOps] User ${userId} starts matching`);
  
  // First ensure user is not in any other state
  await stateManager.removeUserFromAllStates(userId);
  
  // Add to WAITING state
  await stateManager.addUserToState(userId, USER_STATES.WAITING);
  
  return true;
}

/**
 * Move users from WAITING to CONNECTING state (match found)
 */
export async function usersStartConnecting(user1Id: string, user2Id: string): Promise<boolean> {
  console.log(`[StateOps] Users ${user1Id} and ${user2Id} start connecting`);
  
  // Move both users to CONNECTING state
  const user1Moved = await stateManager.moveUserBetweenStates(user1Id, USER_STATES.WAITING, USER_STATES.CONNECTING);
  const user2Moved = await stateManager.moveUserBetweenStates(user2Id, USER_STATES.WAITING, USER_STATES.CONNECTING);
  
  if (!user1Moved || !user2Moved) {
    console.error(`[StateOps] Failed to move users to CONNECTING: user1=${user1Moved}, user2=${user2Moved}`);
    // Cleanup: put any successfully moved users back to WAITING
    if (user1Moved) await stateManager.moveUserBetweenStates(user1Id, USER_STATES.CONNECTING, USER_STATES.WAITING);
    if (user2Moved) await stateManager.moveUserBetweenStates(user2Id, USER_STATES.CONNECTING, USER_STATES.WAITING);
    return false;
  }
  
  return true;
}

/**
 * Move users from CONNECTING to IN_CALL state (connection established)
 */
export async function usersEnterCall(user1Id: string, user2Id: string): Promise<boolean> {
  console.log(`[StateOps] Users ${user1Id} and ${user2Id} enter call`);
  
  // Move both users to IN_CALL state
  const user1Moved = await stateManager.moveUserBetweenStates(user1Id, USER_STATES.CONNECTING, USER_STATES.IN_CALL);
  const user2Moved = await stateManager.moveUserBetweenStates(user2Id, USER_STATES.CONNECTING, USER_STATES.IN_CALL);
  
  if (!user1Moved || !user2Moved) {
    console.error(`[StateOps] Failed to move users to IN_CALL: user1=${user1Moved}, user2=${user2Moved}`);
    // Cleanup: put any successfully moved users back to CONNECTING or WAITING
    if (user1Moved) await stateManager.moveUserBetweenStates(user1Id, USER_STATES.IN_CALL, USER_STATES.CONNECTING);
    if (user2Moved) await stateManager.moveUserBetweenStates(user2Id, USER_STATES.IN_CALL, USER_STATES.CONNECTING);
    return false;
  }
  
  return true;
}

/**
 * Handle SKIP action: both users go to DISCONNECTING then WAITING
 */
export async function usersSkipCall(user1Id: string, user2Id: string): Promise<boolean> {
  console.log(`[StateOps] Users ${user1Id} and ${user2Id} skip call`);
  
  // Move both users to DISCONNECTING first
  const user1ToDisconnecting = await stateManager.moveUserBetweenStates(user1Id, USER_STATES.IN_CALL, USER_STATES.DISCONNECTING);
  const user2ToDisconnecting = await stateManager.moveUserBetweenStates(user2Id, USER_STATES.IN_CALL, USER_STATES.DISCONNECTING);
  
  if (!user1ToDisconnecting || !user2ToDisconnecting) {
    console.error(`[StateOps] Failed to move users to DISCONNECTING during skip`);
    return false;
  }
  
  // Brief delay to represent disconnection process
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Move both users to WAITING state (back to queue)
  const user1ToWaiting = await stateManager.moveUserBetweenStates(user1Id, USER_STATES.DISCONNECTING, USER_STATES.WAITING);
  const user2ToWaiting = await stateManager.moveUserBetweenStates(user2Id, USER_STATES.DISCONNECTING, USER_STATES.WAITING);
  
  if (!user1ToWaiting || !user2ToWaiting) {
    console.error(`[StateOps] Failed to move users to WAITING after skip`);
    return false;
  }
  
  return true;
}

/**
 * Handle END action: ending user goes to IDLE, other user goes to WAITING
 */
export async function userEndsCall(endingUserId: string, otherUserId: string): Promise<boolean> {
  console.log(`[StateOps] User ${endingUserId} ends call, ${otherUserId} goes back to queue`);
  
  // Move both users to DISCONNECTING first
  const endingUserToDisconnecting = await stateManager.moveUserBetweenStates(endingUserId, USER_STATES.IN_CALL, USER_STATES.DISCONNECTING);
  const otherUserToDisconnecting = await stateManager.moveUserBetweenStates(otherUserId, USER_STATES.IN_CALL, USER_STATES.DISCONNECTING);
  
  if (!endingUserToDisconnecting || !otherUserToDisconnecting) {
    console.error(`[StateOps] Failed to move users to DISCONNECTING during end`);
    return false;
  }
  
  // Brief delay to represent disconnection process
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Ending user goes to IDLE, other user goes to WAITING
  const endingUserToIdle = await stateManager.moveUserBetweenStates(endingUserId, USER_STATES.DISCONNECTING, USER_STATES.IDLE);
  const otherUserToWaiting = await stateManager.moveUserBetweenStates(otherUserId, USER_STATES.DISCONNECTING, USER_STATES.WAITING);
  
  if (!endingUserToIdle || !otherUserToWaiting) {
    console.error(`[StateOps] Failed final state transitions during end`);
    return false;
  }
  
  return true;
}

/**
 * Emergency cleanup: remove user from all states
 */
export async function emergencyUserCleanup(userId: string): Promise<boolean> {
  console.log(`[StateOps] Emergency cleanup for user ${userId}`);
  
  const removed = await stateManager.removeUserFromAllStates(userId);
  return removed > 0;
}

/**
 * Get next users from WAITING queue (oldest first)
 */
export async function getNextWaitingUsers(count: number = 2): Promise<string[]> {
  const waitingUsers = await stateManager.getOldestUsersInState(USER_STATES.WAITING, count);
  return waitingUsers.map(user => user.userId);
}

/**
 * Check if a user can be matched (is in WAITING state)
 */
export async function canUserBeMatched(userId: string): Promise<boolean> {
  return await stateManager.isUserInState(userId, USER_STATES.WAITING);
}

/**
 * Check if users are in a call together
 */
export async function areUsersInCall(user1Id: string, user2Id: string): Promise<boolean> {
  const user1InCall = await stateManager.isUserInState(user1Id, USER_STATES.IN_CALL);
  const user2InCall = await stateManager.isUserInState(user2Id, USER_STATES.IN_CALL);
  
  return user1InCall && user2InCall;
}

/**
 * Get system state overview
 */
export async function getSystemStateOverview() {
  const stats = await stateManager.getStateStatistics();
  
  console.log(`[StateOps] System State Overview:`, {
    idle: stats.IDLE,
    waiting: stats.WAITING,
    connecting: stats.CONNECTING,
    inCall: stats.IN_CALL,
    disconnecting: stats.DISCONNECTING,
    total: Object.values(stats).reduce((sum, count) => sum + count, 0)
  });
  
  return stats;
}

/**
 * Cleanup stale users across all states (older than maxAgeMs)
 */
export async function cleanupStaleUsers(maxAgeMs: number = 5 * 60 * 1000): Promise<{
  success: boolean;
  cleanedUserIds: string[];
  error?: string;
}> {
  console.log(`[StateOps] Cleaning up users older than ${maxAgeMs}ms`);
  
  try {
    const cleanedUserIds = await stateManager.cleanupStaleUsers(maxAgeMs);
    
    if (cleanedUserIds.length > 0) {
      console.log(`[StateOps] Cleaned up ${cleanedUserIds.length} stale users:`, cleanedUserIds);
    }
    
    return { success: true, cleanedUserIds };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[StateOps] Error cleaning up stale users: ${errorMessage}`);
    return { success: false, cleanedUserIds: [], error: errorMessage };
  }
}

/**
 * Validate user state consistency (user should only be in one state)
 */
export async function validateUserStateConsistency(userId: string): Promise<{
  isValid: boolean;
  currentState: UserState | null;
  statesFound: UserState[];
}> {
  // Get all states the user is in
  const stateChecks = await Promise.all(
    Object.values(USER_STATES).map(async (state) => {
      const inState = await stateManager.isUserInState(userId, state);
      return inState ? state : null;
    })
  );
  
  const statesFound = stateChecks.filter(state => state !== null) as UserState[];
  const isValid = statesFound.length <= 1;
  const currentState = statesFound.length === 1 ? statesFound[0] : null;
  
  if (!isValid) {
    console.warn(`[StateOps] User ${userId} found in multiple states: ${statesFound.join(', ')}`);
  }
  
  return {
    isValid,
    currentState,
    statesFound
  };
}

/**
 * Force a user into a specific state (cleanup existing states first)
 */
export async function forceUserToState(userId: string, targetState: UserState): Promise<boolean> {
  console.log(`[StateOps] Forcing user ${userId} to state ${targetState}`);
  
  // Remove from all states first
  await stateManager.removeUserFromAllStates(userId);
  
  // Add to target state
  await stateManager.addUserToState(userId, targetState);
  
  // Verify the operation
  const inTargetState = await stateManager.isUserInState(userId, targetState);
  
  if (!inTargetState) {
    console.error(`[StateOps] Failed to force user ${userId} to state ${targetState}`);
    return false;
  }
  
  return true;
} 