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

// Add a console log to show we're using Redis implementation
console.log('Using Redis-based matching service for improved performance and reliability.'); 