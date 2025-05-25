import redis from '../../lib/redis';
import { ACTIVE_MATCHES } from './constants';
import { ActiveMatch } from './types';

/**
 * Verify that a user is authorized to join a specific room
 */
export async function verifyUserRoomAccess(
  username: string,
  roomName: string
): Promise<{
  authorized: boolean;
  matchedWith?: string;
  useDemo?: boolean;
  reason?: string;
}> {
  try {
    // Get the match data for this room
    const matchDataString = await redis.hget(ACTIVE_MATCHES, roomName);
    
    if (!matchDataString) {
      return {
        authorized: false,
        reason: 'No active match found for this room'
      };
    }

    const matchData: ActiveMatch = JSON.parse(matchDataString);
    
    // Check if the user is part of this match
    if (matchData.user1 === username) {
      return {
        authorized: true,
        matchedWith: matchData.user2,
        useDemo: matchData.useDemo
      };
    } else if (matchData.user2 === username) {
      return {
        authorized: true,
        matchedWith: matchData.user1,
        useDemo: matchData.useDemo
      };
    } else {
      return {
        authorized: false,
        reason: 'User is not part of this match'
      };
    }
  } catch (error) {
    console.error(`Error verifying room access for ${username} in ${roomName}:`, error);
    return {
      authorized: false,
      reason: 'Error verifying room access'
    };
  }
}

/**
 * Ensure both users in a match are ready to join the room
 */
export async function ensureMatchReady(
  roomName: string
): Promise<{
  ready: boolean;
  user1?: string;
  user2?: string;
  useDemo?: boolean;
}> {
  try {
    const matchDataString = await redis.hget(ACTIVE_MATCHES, roomName);
    
    if (!matchDataString) {
      return { ready: false };
    }

    const matchData: ActiveMatch = JSON.parse(matchDataString);
    
    return {
      ready: true,
      user1: matchData.user1,
      user2: matchData.user2,
      useDemo: matchData.useDemo
    };
  } catch (error) {
    console.error(`Error checking match readiness for room ${roomName}:`, error);
    return { ready: false };
  }
} 