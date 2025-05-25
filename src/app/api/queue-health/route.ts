import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { MATCHING_QUEUE, ACTIVE_MATCHES, MATCH_LOCK_KEY } from '@/utils/redis/constants';

export async function GET() {
  try {
    const health = await checkQueueHealth();
    return NextResponse.json(health);
  } catch {
    return NextResponse.json({ error: 'Failed to check queue health' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const fixed = await fixQueueIssues();
    return NextResponse.json(fixed);
  } catch {
    return NextResponse.json({ error: 'Failed to fix queue issues' }, { status: 500 });
  }
}

async function checkQueueHealth() {
  const activeMatches = await redis.hgetall(ACTIVE_MATCHES);
  const activeUsernames = new Set<string>();
  
  // Get active users
  for (const matchData of Object.values(activeMatches)) {
    try {
      const match = JSON.parse(matchData as string);
      activeUsernames.add(match.user1);
      activeUsernames.add(match.user2);
    } catch {
      // Corrupted match data
    }
  }
  
  // Check for orphaned users
  const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
  let orphanedUsers = 0;
  let corruptedData = 0;
  
  for (const userData of allQueuedUsersRaw) {
    try {
      const user = JSON.parse(userData);
      
      // Check for orphaned in-call users
      if (user.state === 'in_call' && !activeUsernames.has(user.username)) {
        orphanedUsers++;
      }
      
      // Check for corrupted data
      if (user.joinedAt < 0 || !Number.isFinite(user.joinedAt) || !user.username) {
        corruptedData++;
      }
    } catch {
      corruptedData++;
    }
  }
  
  // Check for stale locks
  const lockTime = await redis.get(`${MATCH_LOCK_KEY}:time`);
  const currentTime = Date.now();
  let staleLocks = 0;
  
  if (lockTime && (currentTime - parseInt(lockTime)) > 10000) {
    staleLocks = 1;
  }
  
  return {
    orphanedUsers,
    staleLocks,
    corruptedData,
    lastCleanup: new Date().toISOString()
  };
}

async function fixQueueIssues() {
  // Implementation of fixQueueIssues function
} 