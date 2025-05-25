import * as redisMatchingService from './redisMatchingService';
import { UserQueueState } from './redis/types';
import { 
  startQueueProcessor, 
  stopQueueProcessor, 
  isQueueProcessorRunning,
  triggerQueueProcessing,
  MatchProcessorResult
} from './redis/queueProcessor';

// Production-ready startup with better error handling
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Initialize the matching service for production
async function initializeMatchingService() {
  if (isInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      console.log('Hybrid matching service: Initializing for production...');
      
      // Wait a moment for Redis to be fully ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if queue processor is already running
      if (!isQueueProcessorRunning()) {
        console.log('Hybrid matching service: Starting background queue processor...');
        startQueueProcessor();
        
        // Verify it started
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (isQueueProcessorRunning()) {
          console.log('Hybrid matching service: Background queue processor started successfully');
        } else {
          console.error('Hybrid matching service: Failed to start background queue processor');
          // Try one more time
          setTimeout(() => {
            if (!isQueueProcessorRunning()) {
              console.log('Hybrid matching service: Retrying queue processor start...');
              startQueueProcessor();
            }
          }, 5000);
        }
      } else {
        console.log('Hybrid matching service: Background queue processor already running');
      }
      
      isInitialized = true;
      console.log('Hybrid matching service: Initialization complete');
      
    } catch (error) {
      console.error('Hybrid matching service: Initialization failed:', error);
      // Reset initialization state so it can be retried
      isInitialized = false;
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

// Start the queue processor automatically when this module is imported (server-side only)
if (typeof window === 'undefined') {
  // Use setImmediate for better async handling in production
  setImmediate(async () => {
    try {
      await initializeMatchingService();
    } catch (error) {
      console.error('Hybrid matching service: Auto-initialization failed:', error);
      
      // Set up retry mechanism
      setTimeout(async () => {
        try {
          await initializeMatchingService();
        } catch (retryError) {
          console.error('Hybrid matching service: Retry initialization failed:', retryError);
        }
      }, 10000); // Retry after 10 seconds
    }
  });
}

// Enhanced add user to queue with initialization check
export async function addUserToQueue(
  username: string, 
  useDemo: boolean, 
  stateOrInCall: UserQueueState | boolean = 'waiting', 
  roomName?: string, 
  lastMatch?: { matchedWith: string }
) {
  // Ensure service is initialized
  try {
    await initializeMatchingService();
  } catch (error) {
    console.error('Failed to initialize matching service, continuing anyway:', error);
  }

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
  
  // Enhanced trigger mechanism with error handling
  setTimeout(async () => {
    try {
      // Double-check that queue processor is running before triggering
      if (!isQueueProcessorRunning()) {
        console.warn('Queue processor not running, attempting to start...');
        startQueueProcessor();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      await triggerQueueProcessing();
    } catch (error) {
      console.error('Error triggering queue processing after user add:', error);
      
      // Try to restart queue processor if triggering fails
      try {
        console.log('Attempting to restart queue processor...');
        stopQueueProcessor();
        await new Promise(resolve => setTimeout(resolve, 1000));
        startQueueProcessor();
      } catch (restartError) {
        console.error('Failed to restart queue processor:', restartError);
      }
    }
  }, 100);
  
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