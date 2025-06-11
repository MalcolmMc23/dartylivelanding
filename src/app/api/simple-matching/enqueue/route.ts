import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';
import { createRoom } from '@/lib/livekitService';

export async function POST(request: Request) {
  try {
    // Validate Redis connection
    if (!redis) {
      console.error('[Enqueue] Redis client not initialized');
      return NextResponse.json(
        { success: false, error: 'Database connection error' },
        { status: 500 }
      );
    }

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
    let inQueue, hasGrace;
    try {
      [inQueue, hasGrace] = await Promise.all([
        redis.get(`matching:waiting_${userId}`),
        redis.get(`requeue-grace:${userId}`)
      ]);
    } catch (error) {
      console.error('[Enqueue] Redis error checking queue status:', error);
      return NextResponse.json(
        { success: false, error: 'Database error checking queue status' },
        { status: 500 }
      );
    }
    
    if (inQueue !== null && !hasGrace) {
      console.log('[Enqueue] User already in queue without grace period');
      return NextResponse.json(
        { success: false, error: 'Already in queue' },
        { status: 400 }
      );
    }

    // Check if user is already in a match
    let existingMatch;
    try {
      existingMatch = await redis.get(`match:${userId}`);
    } catch (error) {
      console.error('[Enqueue] Redis error checking existing match:', error);
      return NextResponse.json(
        { success: false, error: 'Database error checking existing match' },
        { status: 500 }
      );
    }

    if (existingMatch) {
      return NextResponse.json(
        { success: false, error: 'Already in a match' },
        { status: 400 }
      );
    }

    // Clean up stale users and get waiting users in one pass
    const now = Date.now();
    const PRIMARY_HEARTBEAT_TTL = 10000; // 10 seconds
    const SECONDARY_HEARTBEAT_TTL = 30000; // 30 seconds
    let waitingUsers;
    try {
      // Get all keys matching the pattern matching:waiting_*
      const waitingKeys = await redis.keys('matching:waiting_*');
      waitingUsers = [];
      
      // For each key, get the user ID and timestamp
      for (const key of waitingKeys) {
        const userId = key.replace('matching:waiting_', '');
        const timestamp = await redis.get(key);
        if (timestamp) {
          waitingUsers.push(userId, timestamp);
        }
      }
    } catch (error) {
      console.error('[Enqueue] Redis error getting waiting users:', error);
      return NextResponse.json(
        { success: false, error: 'Database error getting waiting users' },
        { status: 500 }
      );
    }
    
    // Process users in pairs (member, score)
    const activeUsers = [];
    for (let i = 0; i < waitingUsers.length; i += 2) {
      const waitingUser = waitingUsers[i];
      const joinTime = parseInt(waitingUsers[i + 1]);
      
      // Skip if user joined too long ago (likely stale)
      if (now - joinTime > 60000) { // 1 minute max queue time
        try {
          await Promise.all([
            redis.del(`matching:waiting_${waitingUser}`),
            redis.del(`heartbeat:primary:${waitingUser}`),
            redis.del(`heartbeat:secondary:${waitingUser}`)
          ]);
          console.log(`Removed stale user ${waitingUser} (joined ${Math.floor((now - joinTime) / 1000)}s ago)`);
        } catch (error) {
          console.error(`[Enqueue] Redis error removing stale user ${waitingUser}:`, error);
          // Continue processing other users even if this fails
        }
        continue;
      }
      
      // Check heartbeats for active users
      let primaryHeartbeat, secondaryHeartbeat;
      try {
        [primaryHeartbeat, secondaryHeartbeat] = await Promise.all([
          redis.get(`heartbeat:primary:${waitingUser}`),
          redis.get(`heartbeat:secondary:${waitingUser}`)
        ]);
      } catch (error) {
        console.error(`[Enqueue] Redis error checking heartbeats for ${waitingUser}:`, error);
        continue;
      }

      const isPrimaryStale = !primaryHeartbeat || (now - parseInt(primaryHeartbeat)) > PRIMARY_HEARTBEAT_TTL;
      const isSecondaryStale = !secondaryHeartbeat || (now - parseInt(secondaryHeartbeat)) > SECONDARY_HEARTBEAT_TTL;

      if (isPrimaryStale || isSecondaryStale) {
        try {
          await Promise.all([
            redis.del(`matching:waiting_${waitingUser}`),
            redis.del(`heartbeat:primary:${waitingUser}`),
            redis.del(`heartbeat:secondary:${waitingUser}`)
          ]);
          console.log(`Removed stale user ${waitingUser} (primary stale: ${isPrimaryStale}, secondary stale: ${isSecondaryStale})`);
        } catch (error) {
          console.error(`[Enqueue] Redis error removing stale user ${waitingUser}:`, error);
          // Continue processing other users even if this fails
        }
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
      let hasCooldown;
      try {
        const cooldownKey = `skip-cooldown:${userId}:${candidateUserId}`;
        hasCooldown = await redis.get(cooldownKey);
      } catch (error) {
        console.error(`[Enqueue] Redis error checking cooldown for ${userId}:${candidateUserId}:`, error);
        continue;
      }

      if (hasCooldown) {
        console.log(`[Enqueue] Skip cooldown active between ${userId} and ${candidateUserId}`);
        continue;
      }
      
      // Double-check the candidate isn't already in a call or being re-queued
      let candidateMatch, candidateGrace;
      try {
        [candidateMatch, candidateGrace] = await Promise.all([
          redis.get(`match:${candidateUserId}`),
          redis.get(`requeue-grace:${candidateUserId}`)
        ]);
      } catch (error) {
        console.error(`[Enqueue] Redis error checking candidate status for ${candidateUserId}:`, error);
        continue;
      }
      
      if (candidateMatch) {
        // User already matched, remove from queue
        try {
          await redis.del(`matching:waiting_${candidateUserId}`);
          console.log(`Candidate ${candidateUserId} already matched, removing from queue`);
        } catch (error) {
          console.error(`[Enqueue] Redis error removing matched candidate ${candidateUserId}:`, error);
        }
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
      const lockId = uuidv4();
      
      // Check if forward lock exists
      let existingLock, reverseLock;
      try {
        [existingLock, reverseLock] = await Promise.all([
          redis.get(lockKey),
          redis.get(reverseLockKey)
        ]);
      } catch (error) {
        console.error(`[Enqueue] Redis error checking locks for ${userId}:${candidateUserId}:`, error);
        continue;
      }

      if (existingLock) {
        console.log(`[Enqueue] Lock already exists for ${userId} -> ${candidateUserId}`);
        continue;
      }
      
      if (reverseLock) {
        console.log(`[Enqueue] Reverse lock exists, someone else is matching these users`);
        continue;
      }
      
      // Set both locks atomically
      try {
        await Promise.all([
          redis.setex(lockKey, 10, lockId),
          redis.setex(reverseLockKey, 10, lockId)
        ]);
      } catch (error) {
        console.error(`[Enqueue] Redis error setting locks for ${userId}:${candidateUserId}:`, error);
        continue;
      }
      
      // Double-check candidate is still available after acquiring locks
      let stillInQueue, stillNoMatch;
      try {
        [stillInQueue, stillNoMatch] = await Promise.all([
          redis.get(`matching:waiting_${candidateUserId}`),
          redis.get(`match:${candidateUserId}`)
        ]);
      } catch (error) {
        console.error(`[Enqueue] Redis error checking candidate availability after lock:`, error);
        await Promise.all([
          redis.del(lockKey),
          redis.del(reverseLockKey)
        ]).catch(e => console.error(`[Enqueue] Redis error cleaning up locks:`, e));
        continue;
      }
      
      if (!stillInQueue || stillNoMatch) {
        console.log(`[Enqueue] Candidate ${candidateUserId} no longer available after lock`);
        await Promise.all([
          redis.del(lockKey),
          redis.del(reverseLockKey)
        ]).catch(e => console.error(`[Enqueue] Redis error cleaning up locks:`, e));
        continue;
      }
      
      // We have the lock and candidate is available
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
        // Clean up locks if room creation fails
        await Promise.all([
          redis.del(`matchlock:${userId}:${matchedUserId}`),
          redis.del(`matchlock:${matchedUserId}:${userId}`)
        ]).catch(e => console.error(`[Enqueue] Redis error cleaning up locks after room creation failure:`, e));
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
      try {
        await Promise.all([
          redis.setex(`match:${userId}`, 300, matchDataStr),
          redis.setex(`match:${matchedUserId}`, 300, matchDataStr),
          redis.zadd('matching:in_call', Date.now(), userId),
          redis.zadd('matching:in_call', Date.now(), matchedUserId),
          redis.del(`matching:waiting_${matchedUserId}`),
          // Clear force-disconnect flags for both users
          redis.del(`force-disconnect:${userId}`),
          redis.del(`force-disconnect:${matchedUserId}`)
        ]);
      } catch (error) {
        console.error('[Enqueue] Redis error storing match data:', error);
        // Clean up locks if match storage fails
        await Promise.all([
          redis.del(`matchlock:${userId}:${matchedUserId}`),
          redis.del(`matchlock:${matchedUserId}:${userId}`)
        ]).catch(e => console.error(`[Enqueue] Redis error cleaning up locks after match storage failure:`, e));
        return NextResponse.json(
          { success: false, error: 'Failed to store match data' },
          { status: 500 }
        );
      }
      
      // Clean up the locks (both directions to be safe)
      await Promise.all([
        redis.del(`matchlock:${userId}:${matchedUserId}`),
        redis.del(`matchlock:${matchedUserId}:${userId}`)
      ]).catch(e => console.error(`[Enqueue] Redis error cleaning up locks after successful match:`, e));
      
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
      try {
        await redis.setex(`matching:waiting_${userId}`, 300, Date.now().toString());
        console.log(`User ${userId} added to waiting queue`);
      } catch (error) {
        console.error('[Enqueue] Redis error adding user to queue:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to add user to queue' },
          { status: 500 }
        );
      }
      
      return NextResponse.json({
        success: true,
        matched: false,
        message: 'Added to queue'
      });
    }
  } catch (error) {
    console.error('[Enqueue] Unhandled error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}