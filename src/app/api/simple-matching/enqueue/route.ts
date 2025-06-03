import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';
import { createRoom } from '@/lib/livekitService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId } = body;
    console.log('[Enqueue] Request received:', { userId, body });

    if (!userId) {
      console.error('[Enqueue] No userId provided');
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    // Check if user is already in queue (but allow if they have requeue grace)
    const [inQueue, hasGrace] = await Promise.all([
      redis.zscore('matching:waiting', userId),
      redis.get(`requeue-grace:${userId}`)
    ]);
    
    if (inQueue !== null && !hasGrace) {
      console.log('[Enqueue] User already in queue without grace period');
      return NextResponse.json(
        { success: false, error: 'Already in queue' },
        { status: 400 }
      );
    }

    // Check if user is already in a match
    const existingMatch = await redis.get(`match:${userId}`);
    if (existingMatch) {
      return NextResponse.json(
        { success: false, error: 'Already in a match' },
        { status: 400 }
      );
    }

    // Clean up stale users and get waiting users in one pass
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds
    const waitingUsers = await redis.zrange('matching:waiting', 0, -1, 'WITHSCORES');
    
    // Process users in pairs (member, score)
    const activeUsers = [];
    for (let i = 0; i < waitingUsers.length; i += 2) {
      const waitingUser = waitingUsers[i];
      const joinTime = parseInt(waitingUsers[i + 1]);
      
      // Skip if user joined too long ago (likely stale)
      if (now - joinTime > 60000) { // 1 minute max queue time
        await redis.zrem('matching:waiting', waitingUser);
        await redis.del(`heartbeat:${waitingUser}`);
        console.log(`Removed stale user ${waitingUser} (joined ${Math.floor((now - joinTime) / 1000)}s ago)`);
        continue;
      }
      
      // Check heartbeat for active users
      const heartbeat = await redis.get(`heartbeat:${waitingUser}`);
      if (!heartbeat || (now - parseInt(heartbeat)) > staleThreshold) {
        await redis.zrem('matching:waiting', waitingUser);
        await redis.del(`heartbeat:${waitingUser}`);
        console.log(`Removed stale user ${waitingUser} (no recent heartbeat)`);
        continue;
      }
      
      activeUsers.push(waitingUser);
    }
    
    // Try to find a match from active users
    let matchedUserId = null;
    for (const candidateUserId of activeUsers) {
      // Skip if it's the same user
      if (candidateUserId === userId) continue;
      
      // Check for skip cooldown between these users
      const cooldownKey = `skip-cooldown:${userId}:${candidateUserId}`;
      const hasCooldown = await redis.get(cooldownKey);
      if (hasCooldown) {
        console.log(`[Enqueue] Skip cooldown active between ${userId} and ${candidateUserId}`);
        continue;
      }
      
      // Double-check the candidate isn't already in a call or being re-queued
      const [candidateMatch, candidateGrace] = await Promise.all([
        redis.get(`match:${candidateUserId}`),
        redis.get(`requeue-grace:${candidateUserId}`)
      ]);
      
      if (candidateMatch) {
        // User already matched, remove from queue
        await redis.zrem('matching:waiting', candidateUserId);
        console.log(`Candidate ${candidateUserId} already matched, removing from queue`);
        continue;
      }
      
      if (candidateGrace) {
        // User is being re-queued after skip, skip them for now
        console.log(`Candidate ${candidateUserId} is in requeue grace period, skipping`);
        continue;
      }
      
      // Valid candidate found - attempt to lock this match
      const lockKey = `matchlock:${userId}:${candidateUserId}`;
      const reverseLockKey = `matchlock:${candidateUserId}:${userId}`;
      
      // Try to acquire lock (prevents race conditions)
      // Using setex with a check for existing key
      const existingLock = await redis.get(lockKey);
      if (existingLock) {
        // Someone else is already matching these users
        continue;
      }
      await redis.setex(lockKey, 5, '1');
      
      // Check if reverse lock exists (other user trying to match with us)
      const reverseLock = await redis.get(reverseLockKey);
      if (reverseLock) {
        await redis.del(lockKey);
        continue;
      }
      
      // We have the lock, this is our match
      matchedUserId = candidateUserId;
      break;
    }
    
    if (matchedUserId) {
      // Found a match!
      console.log(`Attempting to match ${userId} with ${matchedUserId}`);
      
      // Create room name
      const sessionId = uuidv4();
      const roomName = `room_${sessionId}`;
      
      // Create LiveKit room
      try {
        await createRoom(roomName);
        console.log(`Created LiveKit room: ${roomName}`);
      } catch (error) {
        console.error('Failed to create LiveKit room:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to create video room' },
          { status: 500 }
        );
      }
      
      // Store match info in Redis for both users
      const matchData = {
        sessionId,
        roomName,
        user1: userId,
        user2: matchedUserId,
        createdAt: Date.now()
      };
      
      // Use Redis pipeline for atomic operations
      const matchDataStr = JSON.stringify(matchData);
      
      // Execute all operations atomically
      await Promise.all([
        redis.setex(`match:${userId}`, 300, matchDataStr),
        redis.setex(`match:${matchedUserId}`, 300, matchDataStr),
        redis.zadd('matching:in_call', Date.now(), userId),
        redis.zadd('matching:in_call', Date.now(), matchedUserId),
        redis.zrem('matching:waiting', matchedUserId),
        // Clear force-disconnect flags for both users
        redis.del(`force-disconnect:${userId}`),
        redis.del(`force-disconnect:${matchedUserId}`)
      ]);
      
      // Clean up the locks (both directions to be safe)
      await Promise.all([
        redis.del(`matchlock:${userId}:${matchedUserId}`),
        redis.del(`matchlock:${matchedUserId}:${userId}`)
      ]);
      
      console.log(`[Enqueue] Successfully matched users: ${userId} with ${matchedUserId} in room ${roomName}`);
      
      return NextResponse.json({
        success: true,
        matched: true,
        data: {
          sessionId,
          roomName,
          peerId: matchedUserId
        }
      });
    } else {
      // No match available, add to queue
      await redis.zadd('matching:waiting', Date.now(), userId);
      console.log(`User ${userId} added to waiting queue`);
      
      return NextResponse.json({
        success: true,
        matched: false,
        message: 'Added to queue'
      });
    }
  } catch (error) {
    console.error('Error in enqueue:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}