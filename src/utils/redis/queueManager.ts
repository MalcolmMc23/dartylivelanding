import redis from '../../lib/redis';
import { WAITING_QUEUE, IN_CALL_QUEUE, ACTIVE_MATCHES } from './constants';

export async function addUserToQueue(
  username: string,
  useDemo: boolean,
  inCall = false,
  roomName?: string,
  lastMatch?: { matchedWith: string }
) {
  const userData = JSON.stringify({
    username,
    useDemo,
    inCall,
    roomName,
    joinedAt: Date.now(),
    lastMatch: lastMatch ? {
      matchedWith: lastMatch.matchedWith,
      timestamp: Date.now()
    } : undefined
  });

  // First remove user from any queue they might be in
  await removeUserFromQueue(username);

  // Add to appropriate queue with score as join time for sorting
  const queueKey = inCall ? IN_CALL_QUEUE : WAITING_QUEUE;
  await redis.zadd(queueKey, Date.now(), userData);
  
  console.log(`Added ${username} to ${inCall ? 'in-call' : 'waiting'} queue`);
  return { username, added: true };
}

export async function removeUserFromQueue(username: string) {
  // Need to scan both queues to find user by username in the JSON
  const result1 = await scanQueueForUser(WAITING_QUEUE, username);
  const result2 = await scanQueueForUser(IN_CALL_QUEUE, username);
  
  let removed = false;
  
  if (result1) {
    await redis.zrem(WAITING_QUEUE, result1);
    removed = true;
  }
  
  if (result2) {
    await redis.zrem(IN_CALL_QUEUE, result2);
    removed = true;
  }
  
  if (removed) {
    console.log(`Removed ${username} from queue`);
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

// Get waiting queue status
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
    } catch (e) {
      console.error('Error processing match data:', e);
    }
  }
  
  // Check if user is in regular waiting queue
  const waitingUserData = await scanQueueForUser(WAITING_QUEUE, username);
  
  if (waitingUserData) {
    const waitingUsers = await redis.zrange(WAITING_QUEUE, 0, -1, 'WITHSCORES');
    const position = Math.floor(waitingUsers.indexOf(waitingUserData) / 2) + 1;
    
    // Parse user data to extract additional info
    try {
      const userInfo = JSON.parse(waitingUserData);
      return {
        status: 'waiting',
        position,
        queueSize: Math.floor(waitingUsers.length / 2), // WITHSCORES returns [member, score] pairs
        useDemo: userInfo.useDemo
      };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // Fallback if parsing fails
      return {
        status: 'waiting',
        position,
        queueSize: Math.floor(waitingUsers.length / 2)
      };
    }
  }
  
  // Check if user is in in-call queue
  const inCallUserData = await scanQueueForUser(IN_CALL_QUEUE, username);
  
  if (inCallUserData) {
    try {
      const userInfo = JSON.parse(inCallUserData);
      return {
        status: 'in_call',
        roomName: userInfo.roomName,
        useDemo: userInfo.useDemo,
        joinedAt: userInfo.joinedAt
      };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // Fallback if parsing fails
      return {
        status: 'in_call'
      };
    }
  }
  
  return { status: 'not_waiting' };
} 