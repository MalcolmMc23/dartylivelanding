import redis from '../../lib/redis';
import { ACTIVE_MATCHES } from './constants';
import { ActiveMatch } from './types';
import { addUserToQueue } from './queueManager';

const ROOM_OCCUPANCY_KEY = 'room_occupancy';
const MATCH_VALIDATION_TIMEOUT = 30000; // 30 seconds for both users to join (increased from 15)

export interface MatchValidationResult {
  validMatches: number;
  invalidMatches: number;
  usersRequeued: number;
  errors: string[];
}

/**
 * Validate all active matches to ensure both users actually joined their rooms
 */
export async function validateActiveMatches(): Promise<MatchValidationResult> {
  const result: MatchValidationResult = {
    validMatches: 0,
    invalidMatches: 0,
    usersRequeued: 0,
    errors: []
  };

  try {
    console.log('Starting match validation...');
    
    const allMatches = await redis.hgetall(ACTIVE_MATCHES);
    const now = Date.now();
    
    for (const [roomName, matchDataStr] of Object.entries(allMatches)) {
      try {
        const match = JSON.parse(matchDataStr) as ActiveMatch;
        
        // Check if match is old enough to validate (give users time to join)
        const matchAge = now - match.matchedAt;
        if (matchAge < MATCH_VALIDATION_TIMEOUT) {
          continue; // Too new to validate
        }
        
        // Get actual room occupancy
        const occupancyData = await redis.hget(ROOM_OCCUPANCY_KEY, roomName);
        
        if (!occupancyData) {
          // No room occupancy data - match is invalid
          console.log(`Match ${roomName} has no room occupancy data, cleaning up`);
          await cleanupInvalidMatch(match, result);
          continue;
        }
        
        const occupancy = JSON.parse(occupancyData);
        const participants = occupancy.participants || [];
        
        // Check if both users are actually in the room
        const user1InRoom = participants.includes(match.user1);
        const user2InRoom = participants.includes(match.user2);
        
        // If room occupancy shows both users, give them more time to actually connect
        if (user1InRoom && user2InRoom) {
          // Check if this is a recent update (within last 60 seconds)
          const occupancyAge = now - (occupancy.lastUpdated || 0);
          if (occupancyAge < 60000) {
            console.log(`Match ${roomName} has recent occupancy data showing both users, keeping match active`);
            result.validMatches++;
            continue;
          }
          
          // If occupancy is old, check LiveKit room state
          const roomStateData = await redis.hget('rooms:states', roomName);
          if (roomStateData) {
            const roomState = JSON.parse(roomStateData);
            if (roomState.participants && roomState.participants.length >= 2) {
              // Valid match - both users are in the room according to LiveKit
              result.validMatches++;
              console.log(`Match ${roomName} is valid: both ${match.user1} and ${match.user2} are in room`);
              continue;
            }
          }
          
          // Occupancy shows both users but they haven't connected to LiveKit yet
          // Give them more time if the match is still relatively new
          if (matchAge < 60000) {
            console.log(`Match ${roomName} is waiting for users to connect to LiveKit (age: ${matchAge}ms)`);
            continue; // Skip validation for now
          }
        }
        
        if (!user1InRoom && !user2InRoom) {
          // Neither user joined - clean up the match
          console.log(`Match ${roomName} is invalid: neither user joined, cleaning up`);
          await redis.hdel(ACTIVE_MATCHES, roomName);
          result.invalidMatches++;
        } else {
          // Only one user joined - this is the problematic case
          const userInRoom = user1InRoom ? match.user1 : match.user2;
          const userNotInRoom = user1InRoom ? match.user2 : match.user1;
          
          console.log(`Match ${roomName} is invalid: only ${userInRoom} joined, ${userNotInRoom} did not join`);
          
          // Clean up the match and requeue the user who is in the room
          await redis.hdel(ACTIVE_MATCHES, roomName);
          
          // Add the user who is in the room back to queue with 'in_call' state
          // so they can be matched with someone else
          await addUserToQueue(userInRoom, match.useDemo, 'in_call', roomName);
          
          result.invalidMatches++;
          result.usersRequeued++;
          
          console.log(`Requeued ${userInRoom} who was left alone in room ${roomName}`);
        }
        
      } catch (error) {
        const errorMsg = `Error validating match ${roomName}: ${error}`;
        result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
    
    console.log(`Match validation completed:`, result);
    
  } catch (error) {
    const errorMsg = `Error during match validation: ${error}`;
    result.errors.push(errorMsg);
    console.error(errorMsg);
  }
  
  return result;
}

/**
 * Clean up an invalid match where neither user joined
 */
async function cleanupInvalidMatch(match: ActiveMatch, result: MatchValidationResult): Promise<void> {
  try {
    // Remove the match record
    await redis.hdel(ACTIVE_MATCHES, match.roomName);
    
    // Add both users back to the queue as 'waiting'
    await Promise.all([
      addUserToQueue(match.user1, match.useDemo, 'waiting'),
      addUserToQueue(match.user2, match.useDemo, 'waiting')
    ]);
    
    result.invalidMatches++;
    result.usersRequeued += 2;
    
    console.log(`Cleaned up invalid match ${match.roomName} and requeued both users`);
    
  } catch (error) {
    const errorMsg = `Error cleaning up invalid match ${match.roomName}: ${error}`;
    result.errors.push(errorMsg);
    console.error(errorMsg);
  }
}

/**
 * Validate a specific match by room name
 */
export async function validateMatch(roomName: string): Promise<boolean> {
  try {
    const matchDataStr = await redis.hget(ACTIVE_MATCHES, roomName);
    if (!matchDataStr) {
      return false; // No match exists
    }
    
    const match = JSON.parse(matchDataStr) as ActiveMatch;
    const occupancyData = await redis.hget(ROOM_OCCUPANCY_KEY, roomName);
    
    if (!occupancyData) {
      return false; // No room occupancy data
    }
    
    const occupancy = JSON.parse(occupancyData);
    const participants = occupancy.participants || [];
    
    // Check if both users are in the room
    const user1InRoom = participants.includes(match.user1);
    const user2InRoom = participants.includes(match.user2);
    
    return user1InRoom && user2InRoom;
    
  } catch (error) {
    console.error(`Error validating match ${roomName}:`, error);
    return false;
  }
}

/**
 * Check if a user is in a valid match (both users actually in the room)
 */
export async function isUserInValidMatch(username: string): Promise<{ isValid: boolean; roomName?: string; matchedWith?: string }> {
  try {
    const allMatches = await redis.hgetall(ACTIVE_MATCHES);
    
    for (const [roomName, matchDataStr] of Object.entries(allMatches)) {
      try {
        const match = JSON.parse(matchDataStr) as ActiveMatch;
        
        if (match.user1 === username || match.user2 === username) {
          const isValid = await validateMatch(roomName);
          return {
            isValid,
            roomName,
            matchedWith: match.user1 === username ? match.user2 : match.user1
          };
        }
      } catch (error) {
        console.error(`Error checking match ${roomName}:`, error);
      }
    }
    
    return { isValid: false };
    
  } catch (error) {
    console.error(`Error checking if user ${username} is in valid match:`, error);
    return { isValid: false };
  }
} 