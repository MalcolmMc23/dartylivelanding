// In-memory waiting users queue
// In production, you would use a database or Redis
export interface WaitingUser {
  username: string;
  joinedAt: number;
  useDemo: boolean;
  lastMatch?: {
    matchedWith: string;
    timestamp: number;
  };
}

export interface MatchedPair {
  user1: string;
  user2: string;
  roomName: string;
  useDemo: boolean;
  matchedAt: number;
}

// Shared state to be accessed by multiple API routes
// Single global queue for all users
export const matchingState = {
  waitingUsers: [] as WaitingUser[],
  matchedUsers: [] as MatchedPair[]
};

// Maximum time a user can wait before being removed from queue (5 minutes in ms)
export const MAX_WAIT_TIME = 5 * 60 * 1000; 
// Maximum time to keep matched users in memory (10 minutes in ms)
export const MAX_MATCH_TIME = 10 * 60 * 1000;
// Time window to avoid re-matching with the same user (10 seconds in ms)
export const REMATCH_COOLDOWN = 10 * 1000;

// Helper to log the current queue state
function logQueueState(action: string) {
  console.log(`-------- QUEUE STATE AFTER ${action.toUpperCase()} --------`);
  console.log(`Queue size: ${matchingState.waitingUsers.length} users`);
  
  if (matchingState.waitingUsers.length > 0) {
    console.log('Queue contents:');
    matchingState.waitingUsers.forEach((user, index) => {
      const waitTime = Math.floor((Date.now() - user.joinedAt) / 1000);
      console.log(`  ${index + 1}. ${user.username} (waiting for ${waitTime}s)`);
      if (user.lastMatch) {
        console.log(`     Last matched with: ${user.lastMatch.matchedWith}, ${Math.floor((Date.now() - user.lastMatch.timestamp) / 1000)}s ago`);
      }
    });
  }
  console.log('------------------------------------------------');
}

// Clean up waiting users who have been waiting too long
export function cleanupOldWaitingUsers() {
  const now = Date.now();
  const initialLength = matchingState.waitingUsers.length;
  
  matchingState.waitingUsers = matchingState.waitingUsers.filter(user => {
    return (now - user.joinedAt) < MAX_WAIT_TIME;
  });
  
  if (initialLength !== matchingState.waitingUsers.length) {
    console.log(`Cleaned up ${initialLength - matchingState.waitingUsers.length} stale users from waiting queue`);
    logQueueState('cleanup');
  }
}

// Clean up matched pairs that are too old
export function cleanupOldMatches() {
  const now = Date.now();
  const initialLength = matchingState.matchedUsers.length;
  
  matchingState.matchedUsers = matchingState.matchedUsers.filter(match => {
    return (now - match.matchedAt) < MAX_MATCH_TIME;
  });
  
  if (initialLength !== matchingState.matchedUsers.length) {
    console.log(`Cleaned up ${initialLength - matchingState.matchedUsers.length} stale matched pairs`);
    console.log(`Current active matches: ${matchingState.matchedUsers.length}`);
    matchingState.matchedUsers.forEach((match, index) => {
      console.log(`  ${index + 1}. Room: ${match.roomName}, Users: ${match.user1} & ${match.user2}`);
    });
  }
}

// Add a user to the waiting queue
export function addUserToQueue(user: WaitingUser) {
  // Check if user is already in queue, remove them first
  removeUserFromQueue(user.username);
  
  // Add user to the end of the queue
  matchingState.waitingUsers.push(user);
  console.log(`Added ${user.username} to waiting queue. Current queue size: ${matchingState.waitingUsers.length}`);
  
  // Log the complete queue state
  logQueueState('adding user');
}

// Remove a user from the waiting queue
export function removeUserFromQueue(username: string) {
  const initialLength = matchingState.waitingUsers.length;
  matchingState.waitingUsers = matchingState.waitingUsers.filter(user => user.username !== username);
  
  if (initialLength !== matchingState.waitingUsers.length) {
    console.log(`Removed ${username} from waiting queue`);
    
    // Log the complete queue state
    logQueueState('removing user');
  }
} 