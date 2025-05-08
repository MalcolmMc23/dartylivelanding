import * as dbMatchingService from './dbMatchingService';
import * as memoryMatchingService from './matchingService';
import db from '@/lib/db';

// Flag to track if we're using database or in-memory state
let usingDatabase = true;

// Function to set which implementation to use
export async function checkDatabaseAvailability() {
  try {
    usingDatabase = await db.testConnection();
    return usingDatabase;
  } catch (error) {
    console.error('Error checking database availability:', error);
    usingDatabase = false;
    return false;
  }
}

// Add user to waiting queue
export async function addUserToQueue(
  username: string, 
  useDemo: boolean, 
  inCall = false, 
  roomName?: string, 
  lastMatch?: { matchedWith: string }
) {
  try {
    if (usingDatabase) {
      return await dbMatchingService.addUserToQueue(username, useDemo, inCall, roomName, lastMatch);
    }
  } catch (error) {
    console.error('Database error in addUserToQueue, falling back to in-memory:', error);
    usingDatabase = false;
  }
  
  // Fall back to in-memory implementation
  const lastMatchTimestamp = lastMatch ? { matchedWith: lastMatch.matchedWith, timestamp: Date.now() } : undefined;
  
  return await memoryMatchingService.addUserToQueue({
    username,
    useDemo,
    inCall: inCall || false,
    roomName,
    joinedAt: Date.now(),
    lastMatch: lastMatchTimestamp
  });
}

// Remove user from waiting queue
export async function removeUserFromQueue(username: string) {
  try {
    if (usingDatabase) {
      return await dbMatchingService.removeUserFromQueue(username);
    }
  } catch (error) {
    console.error('Database error in removeUserFromQueue, falling back to in-memory:', error);
    usingDatabase = false;
  }
  
  // Fall back to in-memory implementation
  return await memoryMatchingService.removeUserFromQueue(username);
}

// Find match for user
export async function findMatchForUser(username: string, useDemo: boolean, lastMatchedWith?: string) {
  try {
    if (usingDatabase) {
      return await dbMatchingService.findMatchForUser(username, useDemo, lastMatchedWith);
    }
  } catch (error) {
    console.error('Database error in findMatchForUser, falling back to in-memory:', error);
    usingDatabase = false;
  }
  
  // Fall back to in-memory implementation
  const lastMatch = lastMatchedWith ? { matchedWith: lastMatchedWith, timestamp: Date.now() } : undefined;
  const matchedUser = await memoryMatchingService.getPrioritizedMatch(username, lastMatch);
  
  if (matchedUser) {
    // Remove the matched user from the queue
    await memoryMatchingService.removeUserFromQueue(matchedUser.username);
    
    // If the matched user is already in a call, use their existing room
    const roomName = matchedUser.inCall 
      ? matchedUser.roomName! // Non-null assertion is safe since we checked inCall === true
      : `match-${Math.random().toString(36).substring(2, 10)}`;
    
    console.log(`Matched user ${username} with ${matchedUser.username}${matchedUser.inCall ? ' who was alone in room ' + roomName : ''}`);
    
    // Use the demo server setting from the first user if it was enabled
    const finalUseDemo = useDemo || matchedUser.useDemo;
    
    // Store the match
    memoryMatchingService.matchingState.matchedUsers.push({
      user1: username,
      user2: matchedUser.username,
      roomName,
      useDemo: finalUseDemo,
      matchedAt: Date.now()
    });
    
    return {
      status: 'matched',
      roomName,
      matchedWith: matchedUser.username,
      useDemo: finalUseDemo
    };
  }
  
  return { status: 'waiting' };
}

// Handle user disconnection
export async function handleUserDisconnection(username: string, roomName: string, otherUsername?: string) {
  try {
    if (usingDatabase) {
      return await dbMatchingService.handleUserDisconnection(username, roomName, otherUsername);
    }
  } catch (error) {
    console.error('Database error in handleUserDisconnection, falling back to in-memory:', error);
    usingDatabase = false;
  }
  
  // Fall back to in-memory implementation
  const matchIndex = memoryMatchingService.matchingState.matchedUsers.findIndex(
    match => match.roomName === roomName
  );
  
  if (matchIndex >= 0) {
    // Get the match details
    const match = memoryMatchingService.matchingState.matchedUsers[matchIndex];
    
    // Get both users
    const user1 = match.user1;
    const user2 = match.user2;
    
    console.log(`Found match between ${user1} and ${user2} in room ${roomName}`);
    
    // Remove the match from our tracking
    memoryMatchingService.matchingState.matchedUsers.splice(matchIndex, 1);
    console.log(`Removed match between ${user1} and ${user2} due to disconnection`);
    
    // Add the left-behind user to the waiting queue with inCall=true
    let leftBehindUser: string;
    
    if (otherUsername) {
      // If otherUsername is provided, it's the user who remained
      leftBehindUser = otherUsername;
    } else {
      // If no otherUsername provided, determine who's left behind
      leftBehindUser = user1 === username ? user2 : user1;
    }
    
    await memoryMatchingService.addUserToQueue({
      username: leftBehindUser,
      joinedAt: Date.now(),
      useDemo: match.useDemo,
      inCall: true,
      roomName: roomName,
      lastMatch: {
        matchedWith: username,
        timestamp: Date.now()
      }
    });
    
    console.log(`Added left-behind user ${leftBehindUser} back to waiting queue with inCall=true`);
    
    return {
      status: 'disconnected',
      leftBehindUser,
      users: [user1, user2]
    };
  }
  
  return { status: 'no_match_found' };
}

// Cleanup functions
export async function cleanupOldWaitingUsers() {
  try {
    if (usingDatabase) {
      return await dbMatchingService.cleanupOldWaitingUsers();
    }
  } catch (error) {
    console.error('Database error in cleanupOldWaitingUsers, falling back to in-memory:', error);
    usingDatabase = false;
  }
  
  // Fall back to in-memory implementation
  await memoryMatchingService.cleanupOldWaitingUsers();
  return [];
}

export async function cleanupOldMatches() {
  try {
    if (usingDatabase) {
      return await dbMatchingService.cleanupOldMatches();
    }
  } catch (error) {
    console.error('Database error in cleanupOldMatches, falling back to in-memory:', error);
    usingDatabase = false;
  }
  
  // Fall back to in-memory implementation
  await memoryMatchingService.cleanupOldMatches();
  return [];
}

// Get waiting queue status
export async function getWaitingQueueStatus(username: string) {
  try {
    if (usingDatabase) {
      return await dbMatchingService.getWaitingQueueStatus(username);
    }
  } catch (error) {
    console.error('Database error in getWaitingQueueStatus, falling back to in-memory:', error);
    usingDatabase = false;
  }
  
  // Use mutex to safely access shared state
  return await memoryMatchingService.mutex.runExclusive(async () => {
    // Check if user has been matched
    const existingMatch = memoryMatchingService.matchingState.matchedUsers.find(
      match => match.user1 === username || match.user2 === username
    );
    
    if (existingMatch) {
      return {
        status: 'matched',
        roomName: existingMatch.roomName,
        matchedWith: existingMatch.user1 === username ? existingMatch.user2 : existingMatch.user1,
        useDemo: existingMatch.useDemo
      };
    }
    
    // Check if user is in waiting queue
    const isWaiting = memoryMatchingService.matchingState.waitingUsers.some(user => user.username === username);
    
    return {
      status: isWaiting ? 'waiting' : 'not_waiting',
      position: isWaiting 
        ? memoryMatchingService.matchingState.waitingUsers.findIndex(user => user.username === username) + 1 
        : null,
      queueSize: memoryMatchingService.matchingState.waitingUsers.length
    };
  });
}

// Initialize by checking database connection
checkDatabaseAvailability(); 