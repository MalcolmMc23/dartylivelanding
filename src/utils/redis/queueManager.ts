import redis from '../../lib/redis';
import { MATCHING_QUEUE, ACTIVE_MATCHES, WAITING_QUEUE, IN_CALL_QUEUE } from './constants';
import { UserQueueState, UserDataInQueue, calculateQueueScore } from './types';
import { getUserSkipStats } from './skipStatsManager';

export async function addUserToQueue(
  username: string,
  useDemo: boolean,
  state: UserQueueState = 'waiting',
  roomName?: string,
  lastMatch?: { matchedWith: string }
) {
  const now = Date.now();
  
  // Check if user is already in queue with the same state to prevent thrashing
  const existingUserDataString = await scanQueueForUser(MATCHING_QUEUE, username);
  if (existingUserDataString) {
    try {
      const existingUser = JSON.parse(existingUserDataString) as UserDataInQueue;
      if (existingUser.state === state && existingUser.roomName === roomName) {
        console.log(`User ${username} already in queue with state '${state}' and room ${roomName || 'none'}, skipping add`);
        return { username, added: false, state, reason: 'already_in_queue' };
      }
    } catch (e) {
      console.error('Error parsing existing user data:', e);
    }
  }
  
  // Fetch user's skip stats
  let averageSkipTime: number | undefined = undefined;
  let skipCount: number | undefined = undefined;
  const userStats = await getUserSkipStats(username);
  if (userStats) {
    averageSkipTime = userStats.averageSkipTime;
    skipCount = userStats.totalSkipsInvolved;
    console.log(`Fetched skip stats for ${username}: avgSkipTime=${averageSkipTime}, skipCount=${skipCount}`);
  } else {
    console.log(`No skip stats found for ${username}, will use defaults.`);
  }
  
  // Construct user data using the new structure
  const userData: UserDataInQueue = {
    username,
    useDemo,
    state,
    roomName,
    joinedAt: now,
    lastMatch: lastMatch ? {
      matchedWith: lastMatch.matchedWith,
      timestamp: now
    } : undefined,
    averageSkipTime,
    skipCount,
  };

  // Calculate score for priority, now passing skip stats
  const score = calculateQueueScore(state, now, averageSkipTime, skipCount);
  
  // Remove user from any queue they might be in (both new and legacy queues)
  const wasRemoved = await removeUserFromQueue(username);
  if (wasRemoved) {
    console.log(`Removed ${username} from existing queue before re-adding with new state`);
  }

  // Add to the new unified queue with priority score
  const userDataString = JSON.stringify(userData);
  await redis.zadd(MATCHING_QUEUE, score, userDataString);
  
  console.log(`Added ${username} to matching queue with state '${state}', avgSkipTime: ${averageSkipTime}, skipCount: ${skipCount}, and priority score ${score}`);
  
  return { username, added: true, state };
}

export async function removeUserFromQueue(username: string) {
  let removed = false;
  
  // Check the new unified queue
  const result = await scanQueueForUser(MATCHING_QUEUE, username);
  if (result) {
    await redis.zrem(MATCHING_QUEUE, result);
    removed = true;
  }
  
  // For backward compatibility - also check legacy queues
  const result1 = await scanQueueForUser(WAITING_QUEUE, username);
  const result2 = await scanQueueForUser(IN_CALL_QUEUE, username);
  
  if (result1) {
    await redis.zrem(WAITING_QUEUE, result1);
    removed = true;
  }
  
  if (result2) {
    await redis.zrem(IN_CALL_QUEUE, result2);
    removed = true;
  }
  
  if (removed) {
    console.log(`Removed ${username} from queue system`);
  }
  
  return removed;
}

// Helper to find user data in a queue
export async function scanQueueForUser(queueKey: string, username: string): Promise<string | undefined> {
  const allMembers = await redis.zrange(queueKey, 0, -1);
  return allMembers.find((member: string) => {
    try {
      const data = JSON.parse(member);
      return data.username === username;
    } catch {
      return false;
    }
  });
}

// Get user's current status in the queue system
export async function getWaitingQueueStatus(username: string) {
  // Check if user has been matched
  const allMatches = await redis.hgetall(ACTIVE_MATCHES);
  
  for (const [roomName, matchData] of Object.entries(allMatches)) {
    try {
      const match = JSON.parse(matchData as string);
      if (match.user1 === username || match.user2 === username) {
        return {
          status: 'matched',
          roomName,
          matchedWith: match.user1 === username ? match.user2 : match.user1,
          useDemo: match.useDemo
        };
      }
    } catch {
      console.error('Error processing match data');
    }
  }
  
  // Check if user is in the new unified queue
  const userData = await scanQueueForUser(MATCHING_QUEUE, username);
  
  if (userData) {
    try {
      const userInfo = JSON.parse(userData) as UserDataInQueue;
      
      // Calculate position based on score-based ordering
      let position = 0;
      let queueSize = 0;
      
      // Get all users in the queue with their scores (ordered by priority)
      const allUsersWithScores = await redis.zrange(MATCHING_QUEUE, 0, -1, 'WITHSCORES');
      
      // Parse users and filter by state to get accurate position
      const usersInSameState = [];
      for (let i = 0; i < allUsersWithScores.length; i += 2) {
        try {
          const userDataString = allUsersWithScores[i];
          const user = JSON.parse(userDataString);
          
          // Only include users in the same state for position calculation
          if (user.state === userInfo.state) {
            usersInSameState.push(user);
          }
        } catch {
          // Skip invalid entries
        }
      }
      
      // Find this user's position in the filtered list (already in priority order)
      position = usersInSameState.findIndex(u => u.username === username) + 1;
      queueSize = usersInSameState.length;
      
      console.log(`User ${username} position in ${userInfo.state} queue: ${position}/${queueSize} (score-based priority)`);
      
      return {
        status: userInfo.state,
        roomName: userInfo.roomName,
        useDemo: userInfo.useDemo,
        joinedAt: userInfo.joinedAt,
        position: position > 0 ? position : undefined,
        queueSize: queueSize > 0 ? queueSize : undefined,
        averageSkipTime: userInfo.averageSkipTime,
        skipCount: userInfo.skipCount
      };
    } catch {
      console.error('Error parsing user data from queue');
      // Fallback with limited info if parsing fails
      return {
        status: 'in_queue'
      };
    }
  }
  
  // Fallback to legacy queue checks for transition period
  const waitingUserData = await scanQueueForUser(WAITING_QUEUE, username);
  if (waitingUserData) {
    try {
      const userInfo = JSON.parse(waitingUserData);
      return {
        status: 'waiting',
        useDemo: userInfo.useDemo
      };
    } catch {
      return { status: 'waiting' };
    }
  }
  
  const inCallUserData = await scanQueueForUser(IN_CALL_QUEUE, username);
  if (inCallUserData) {
    try {
      const userInfo = JSON.parse(inCallUserData);
      return {
        status: 'in_call',
        roomName: userInfo.roomName,
        useDemo: userInfo.useDemo
      };
    } catch {
      return { status: 'in_call' };
    }
  }
  
  return { status: 'not_waiting' };
} 