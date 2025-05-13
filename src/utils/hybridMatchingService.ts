import * as redisMatchingService from './redisMatchingService';

// Add user to waiting queue
export async function addUserToQueue(
  username: string, 
  useDemo: boolean, 
  inCall = false, 
  roomName?: string, 
  lastMatch?: { matchedWith: string }
) {
  return await redisMatchingService.addUserToQueue(
    username,
    useDemo,
    inCall || false,
    roomName,
    lastMatch
  );
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

// Cleanup functions
export async function cleanupOldWaitingUsers() {
  return await redisMatchingService.cleanupOldWaitingUsers();
}

export async function cleanupOldMatches() {
  return await redisMatchingService.cleanupOldMatches();
}

// Get waiting queue status
export async function getWaitingQueueStatus(username: string) {
  return await redisMatchingService.getWaitingQueueStatus(username);
}

// Add a console log to show we're using Redis implementation
console.log('Using Redis-based matching service for improved performance and reliability.'); 