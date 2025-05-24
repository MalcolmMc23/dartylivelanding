import * as redisMatchingService from './redisMatchingService';
import { UserQueueState } from './redis/types';
import { 
  startQueueProcessor, 
  stopQueueProcessor, 
  isQueueProcessorRunning,
  triggerQueueProcessing,
  MatchProcessorResult
} from './redis/queueProcessor';

// Start the queue processor automatically when this module is imported
// This ensures background matching is always running
if (typeof window === 'undefined') { // Server-side only
  // Start with a small delay to ensure Redis connection is ready
  setTimeout(() => {
    if (!isQueueProcessorRunning()) {
      startQueueProcessor();
      console.log('Hybrid matching service: Started background queue processor');
    }
  }, 1000);
}

// Add user to queue
export async function addUserToQueue(
  username: string, 
  useDemo: boolean, 
  stateOrInCall: UserQueueState | boolean = 'waiting', 
  roomName?: string, 
  lastMatch?: { matchedWith: string }
) {
  // Handle backward compatibility where inCall was a boolean
  const state: UserQueueState = 
    typeof stateOrInCall === 'boolean' 
      ? (stateOrInCall ? 'in_call' : 'waiting') 
      : stateOrInCall;
      
  const result = await redisMatchingService.addUserToQueue(
    username,
    useDemo,
    state,
    roomName,
    lastMatch
  );
  
  // Trigger queue processing after adding a user to immediately check for matches
  setTimeout(async () => {
    try {
      await triggerQueueProcessing();
    } catch (error) {
      console.error('Error triggering queue processing after user add:', error);
    }
  }, 100); // Small delay to ensure the user is fully added to the queue
  
  return result;
}

// Remove user from waiting queue
export async function removeUserFromQueue(username: string) {
  return await redisMatchingService.removeUserFromQueue(username);
}

// Find match for user
export async function findMatchForUser(username: string, useDemo: boolean, lastMatchedWith?: string) {
  return await redisMatchingService.findMatchForUser(username, useDemo, lastMatchedWith);
}

// Handle user disconnection
export async function handleUserDisconnection(username: string, roomName: string, otherUsername?: string) {
  return await redisMatchingService.handleUserDisconnection(username, roomName, otherUsername);
}

// Handle user skip (SKIP button) - one user leaves, other stays for re-matching
export async function handleUserSkip(username: string, roomName: string, otherUsername?: string) {
  return await redisMatchingService.handleUserSkip(username, roomName, otherUsername);
}

// Handle session end (END CALL button) - both users leave completely
export async function handleSessionEnd(username: string, roomName: string, otherUsername?: string) {
  return await redisMatchingService.handleSessionEnd(username, roomName, otherUsername);
}

// Get information about a room and its users
export async function getRoomInfo(roomName: string) {
  return await redisMatchingService.getRoomInfo(roomName);
}

// Cleanup old waiting users
export async function cleanupOldWaitingUsers() {
  return await redisMatchingService.cleanupOldWaitingUsers();
}

// Cleanup old matches
export async function cleanupOldMatches() {
  return await redisMatchingService.cleanupOldMatches();
}

// Get waiting queue status
export async function getWaitingQueueStatus(username: string) {
  return await redisMatchingService.getWaitingQueueStatus(username);
}

// Confirm a user's rematch and update their left-behind status
export async function confirmUserRematch(username: string, matchRoom: string, matchedWith: string) {
  return await redisMatchingService.confirmUserRematch(username, matchRoom, matchedWith);
}

// Queue processor management functions
export function startBackgroundProcessor() {
  return startQueueProcessor();
}

export function stopBackgroundProcessor() {
  return stopQueueProcessor();
}

export function isBackgroundProcessorRunning(): boolean {
  return isQueueProcessorRunning();
}

export async function triggerImmediateProcessing(): Promise<MatchProcessorResult> {
  return await triggerQueueProcessing();
}

// Add a console log to show we're using Redis implementation
console.log('Using Redis-based matching service with improved queue system and background processor.'); 