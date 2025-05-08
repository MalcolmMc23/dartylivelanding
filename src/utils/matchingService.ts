import { Mutex } from 'async-mutex';

// In-memory waiting users queue
// In production, you would use a database or Redis
export interface WaitingUser {
  username: string;
  joinedAt: number;
  useDemo: boolean;
  // For users who are alone in a call waiting for someone to join
  inCall?: boolean;  
  roomName?: string;
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

// Mutex for concurrent access control
const mutex = new Mutex();
// Export the mutex for use in other modules
export { mutex };

// --- Logging --- //

// Flag to ensure interval is set only once
let loggingIntervalSet = false;

if (process.env.NODE_ENV === 'development' && !loggingIntervalSet) {
  loggingIntervalSet = true;
  setInterval(() => {
    console.log(`[${new Date().toISOString()}] Waiting Queue (${matchingState.waitingUsers.length}):`, 
      matchingState.waitingUsers.map(u => ({ u: u.username, iC: u.inCall, lM: u.lastMatch }))
    );
    // Optionally log matched users too:
    // console.log(`[${new Date().toISOString()}] Matched Pairs (${matchingState.matchedUsers.length}):`, 
    //   matchingState.matchedUsers.map(m => ({ p1: m.user1, p2: m.user2, r: m.roomName }))
    // );
  }, 5000); // Log every 5 seconds
  console.log("Initialized periodic queue logging (every 5s).");
}

// --- Cleanup Functions --- //

// Clean up waiting users who have been waiting too long
export async function cleanupOldWaitingUsers() {
  return await mutex.runExclusive(() => {
    const now = Date.now();
    const initialLength = matchingState.waitingUsers.length;
    
    matchingState.waitingUsers = matchingState.waitingUsers.filter(user => {
      return (now - user.joinedAt) < MAX_WAIT_TIME;
    });
    
    if (initialLength !== matchingState.waitingUsers.length) {
      console.log(`Cleaned up ${initialLength - matchingState.waitingUsers.length} stale users from waiting queue`);
    }
  });
}

// Clean up matched pairs that are too old
export async function cleanupOldMatches() {
  return await mutex.runExclusive(() => {
    const now = Date.now();
    const initialLength = matchingState.matchedUsers.length;
    
    matchingState.matchedUsers = matchingState.matchedUsers.filter(match => {
      return (now - match.matchedAt) < MAX_MATCH_TIME;
    });
    
    if (initialLength !== matchingState.matchedUsers.length) {
      console.log(`Cleaned up ${initialLength - matchingState.matchedUsers.length} stale matched pairs`);
    }
  });
}

// Add a user to the waiting queue
export async function addUserToQueue(user: WaitingUser) {
  return await mutex.runExclusive(() => {
    // Check if user is already in queue, remove them first
    const initialLength = matchingState.waitingUsers.length;
    matchingState.waitingUsers = matchingState.waitingUsers.filter(u => u.username !== user.username);
    
    if (initialLength !== matchingState.waitingUsers.length) {
      console.log(`Removed existing ${user.username} from waiting queue before adding again`);
    }
    
    // Add user to the end of the queue
    matchingState.waitingUsers.push(user);
    console.log(`Added ${user.username} to waiting queue. Current queue size: ${matchingState.waitingUsers.length}`);
  });
}

// Remove a user from the waiting queue
export async function removeUserFromQueue(username: string) {
  return await mutex.runExclusive(() => {
    const initialLength = matchingState.waitingUsers.length;
    matchingState.waitingUsers = matchingState.waitingUsers.filter(user => user.username !== username);
    
    if (initialLength !== matchingState.waitingUsers.length) {
      console.log(`Removed ${username} from waiting queue`);
      return true;
    }
    return false;
  });
}

// Get all users who are alone in calls waiting for someone to join
export async function getUsersAloneInCalls(): Promise<WaitingUser[]> {
  return await mutex.runExclusive(() => {
    return matchingState.waitingUsers.filter(user => user.inCall === true);
  });
}

// Get a prioritized match based on matching rules
export async function getPrioritizedMatch(username: string, lastMatch?: { matchedWith: string, timestamp: number }): Promise<WaitingUser | null> {
  return await mutex.runExclusive(async () => {
    // First check for users alone in calls
    const usersAloneInCall = await getUsersAloneInCalls();
    
    if (usersAloneInCall.length > 0) {
      // Prioritize the user who has been waiting the longest
      return usersAloneInCall.sort((a, b) => a.joinedAt - b.joinedAt)[0];
    }
    
    // If no users alone in calls, proceed with normal matching
    // Default time window to avoid re-matching (5 minutes in ms)
    const REMATCH_COOLDOWN = 5 * 60 * 1000;
    const now = Date.now();
    
    // Sort users by join time (oldest first)
    const sortedWaitingUsers = [...matchingState.waitingUsers]
      .filter(user => !user.inCall) // Filter out users who are in a call
      .sort((a, b) => a.joinedAt - b.joinedAt);
    
    // Find the first eligible match (not the same user they just left)
    for (let i = 0; i < sortedWaitingUsers.length; i++) {
      const candidateUser = sortedWaitingUsers[i];
      
      // Skip if this is the same user they just left and it's within the cooldown period
      const isRecentMatch = candidateUser.lastMatch 
                            && candidateUser.lastMatch.matchedWith === username
                            && (now - candidateUser.lastMatch.timestamp) < REMATCH_COOLDOWN;
      
      // Skip if the current user has a lastMatch that points to this candidate and is recent
      const userHasRecentMatch = lastMatch 
                                && lastMatch.matchedWith === candidateUser.username
                                && (now - lastMatch.timestamp) < REMATCH_COOLDOWN;
      
      if (!isRecentMatch && !userHasRecentMatch) {
        // Found a match!
        return candidateUser;
      }
    }
    
    return null;
  });
} 