import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { deleteRoom, createRoom } from '@/lib/livekitService';
import { v4 as uuidv4 } from 'uuid';

// Type for a successful match
interface MatchData {
  sessionId: string;
  roomName: string;
  user1: string;
  user2: string;
  createdAt: number;
}

// Type for the result of tryMatchUser
// Discriminated union, no null
type TryMatchUserResult =
  | { matched: true; matchData: MatchData; peerId: string }
  | { matched: false };

export async function POST(request: Request) {
  let userId: string | undefined;
  let sessionId: string | undefined;
  
  try {
    const body = await request.json();
    userId = body.userId;
    sessionId = body.sessionId;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    console.log(`[Skip] User ${userId} skipping session ${sessionId || 'unknown'}`);

    // Get match data to find the other user
    const matchData = await redis.get(`match:${userId}`);
    let roomName: string | null = null;
    let otherUserId: string | null = null;

    if (matchData) {
      const match = JSON.parse(matchData);
      roomName = match.roomName;
      otherUserId = match.user1 === userId ? match.user2 : match.user1;
    }

    // === SET FORCE-DISCONNECT FLAG FIRST ===
    // Set force-disconnect for the other user before deleting room
    if (otherUserId) {
      await redis.setex(`force-disconnect:${otherUserId}`, 120, 'true'); // 120 seconds to ensure detection
      console.log(`[Skip] Set force-disconnect flag for ${otherUserId}`);
    }

    // === DELETE LIVEKIT ROOM ===
    // Delete the room to disconnect both users
    if (roomName) {
      console.log(`[Skip] Deleting LiveKit room: ${roomName}`);
      try {
        await deleteRoom(roomName);
        console.log(`[Skip] LiveKit room deleted successfully`);
      } catch (error) {
        console.error('[Skip] Error deleting LiveKit room:', error);
        // Continue with cleanup even if room deletion fails
      }
    }

    // === CLEANUP BOTH USERS (Optimized with parallel operations) ===
    console.log(`[Skip] Cleaning up both users: ${userId} and ${otherUserId}`);
    
    // Prepare cleanup operations
    const cleanupOps = [
      // Clean up current user (skipper)
      redis.del(`matching:waiting_${userId}`),
      redis.zrem('matching:in_call', userId),
      redis.del(`match:${userId}`),
      redis.del(`force-disconnect:${userId}`),
      redis.del(`heartbeat:${userId}`),
      redis.del(`requeue-grace:${userId}`)
    ];
    
    // Add other user cleanup if exists
    if (otherUserId) {
      cleanupOps.push(
        redis.del(`matching:waiting_${otherUserId}`),
        redis.zrem('matching:in_call', otherUserId),
        redis.del(`match:${otherUserId}`),
        redis.del(`heartbeat:${otherUserId}`),
        redis.del(`requeue-grace:${otherUserId}`)
      );
    }
    
    // Execute all cleanup operations in parallel
    await Promise.all(cleanupOps);
    console.log(`[Skip] Cleanup completed for both users`);

    // === WAIT FOR DISCONNECTION TO PROPAGATE ===
    // Add a longer delay to ensure LiveKit has fully processed the room deletion
    await new Promise(resolve => setTimeout(resolve, 1500));

    // === RESTORE HEARTBEATS BEFORE MATCHING ===
    // We need fresh heartbeats for the matching logic to work
    const now = Date.now();
    await redis.setex(`heartbeat:${userId}`, 30, now.toString());
    if (otherUserId) {
      await redis.setex(`heartbeat:${otherUserId}`, 30, now.toString());
    }
    
    // === TRY TO MATCH BOTH USERS WITH OTHERS IN QUEUE ===
    const matchResults: {
      skipper?: TryMatchUserResult;
      other?: TryMatchUserResult;
    } = {};
    
    // Helper function to try matching a user
    async function tryMatchUser(userToMatch: string, excludeUserId?: string): Promise<TryMatchUserResult> {
      // Mark this user as being processed for matching to prevent race conditions
      const matchingInProgressKey = `matching-in-progress:${userToMatch}`;
      const alreadyMatching = await redis.get(matchingInProgressKey);
      if (alreadyMatching) {
        console.log(`[Skip] User ${userToMatch} is already being matched by another process`);
        return { matched: false };
      }
      
      // Set matching in progress flag with short TTL
      await redis.setex(matchingInProgressKey, 5, 'true');
      
      try {
        // Check if user has recent heartbeat (use current time for check)
        const currentTime = Date.now();
        let userHeartbeat = await redis.get(`heartbeat:${userToMatch}`);
        if (!userHeartbeat || (currentTime - parseInt(userHeartbeat)) > 30000) {
          console.log(`[Skip] User ${userToMatch} heartbeat is stale or missing – refreshing and continuing`);
          await redis.setex(`heartbeat:${userToMatch}`, 30, currentTime.toString());
          userHeartbeat = currentTime.toString();
        }
      
      // Set skip cooldown to prevent immediate re-matching with the same person
      if (excludeUserId && excludeUserId !== userToMatch) {
        const cooldownKey = `skip-cooldown:${userToMatch}:${excludeUserId}`;
        const reverseCooldownKey = `skip-cooldown:${excludeUserId}:${userToMatch}`;
        
        // Set 30-second cooldown between these specific users
        await Promise.all([
          redis.setex(cooldownKey, 30, 'true'),
          redis.setex(reverseCooldownKey, 30, 'true')
        ]);
        console.log(`[Skip] Set cooldown between ${userToMatch} and ${excludeUserId}`);
      }
      
      // Refresh heartbeat to prevent immediate cleanup
      await redis.setex(`heartbeat:${userToMatch}`, 30, currentTime.toString());
      
      // Get all waiting users with scores for age filtering
      const waitingKeys = await redis.keys('matching:waiting_*');
      const waitingUsers = [];
      
      // Process users and filter stale ones
      for (const key of waitingKeys) {
        const candidateUserId = key.replace('matching:waiting_', '');
        const joinTime = parseInt(await redis.get(key) || '0');
        
        // Skip if too old in queue (> 1 minute)
        if (currentTime - joinTime > 60000) {
          await redis.del(`matching:waiting_${candidateUserId}`);
          continue;
        }
        
        // Skip if it's the same user or the excluded user
        if (candidateUserId === userToMatch || candidateUserId === excludeUserId) continue;
        
        waitingUsers.push(candidateUserId);
      }
      
      console.log(`[Skip] Found ${waitingUsers.length} potential matches for ${userToMatch}`);
      
      // Try to find a match from filtered list
      for (const candidateUserId of waitingUsers) {
        // Check if candidate is being matched by another process
        const candidateMatchingInProgress = await redis.get(`matching-in-progress:${candidateUserId}`);
        if (candidateMatchingInProgress) {
          console.log(`[Skip] Candidate ${candidateUserId} is being matched by another process`);
          continue;
        }
        
        // Check for skip cooldown between these users
        const cooldownKey = `skip-cooldown:${userToMatch}:${candidateUserId}`;
        const hasCooldown = await redis.get(cooldownKey);
        if (hasCooldown) {
          console.log(`[Skip] Cooldown active between ${userToMatch} and ${candidateUserId}, skipping`);
          continue;
        }
        
        // Batch check heartbeat and existing match
        const [candidateHeartbeat, candidateMatch] = await Promise.all([
          redis.get(`heartbeat:${candidateUserId}`),
          redis.get(`match:${candidateUserId}`)
        ]);
        
        // Check heartbeat
        if (!candidateHeartbeat || (currentTime - parseInt(candidateHeartbeat)) > 30000) {
          await redis.del(`matching:waiting_${candidateUserId}`);
          await redis.del(`heartbeat:${candidateUserId}`);
          continue;
        }
        
        // Check if already matched
        if (candidateMatch) {
          await redis.del(`matching:waiting_${candidateUserId}`);
          continue;
        }
        
        // Found a potential match - need to lock it
        console.log(`[Skip] Found potential match: ${userToMatch} with ${candidateUserId}`);
        
        // Create bidirectional locks to prevent race conditions
        const lockKey = `matchlock:${userToMatch}:${candidateUserId}`;
        const reverseLockKey = `matchlock:${candidateUserId}:${userToMatch}`;
        
        // Try to acquire both locks atomically using Redis SETNX with expiry
        const lockId = uuidv4();
        
        // Check if forward lock exists
        const existingLock = await redis.get(lockKey);
        if (existingLock) {
          console.log(`[Skip] Lock already exists for ${userToMatch} -> ${candidateUserId}`);
          continue;
        }
        
        // Check if reverse lock exists
        const reverseLock = await redis.get(reverseLockKey);
        if (reverseLock) {
          console.log(`[Skip] Reverse lock exists, someone else is matching these users`);
          continue;
        }
        
        // Set both locks atomically
        await Promise.all([
          redis.setex(lockKey, 10, lockId),
          redis.setex(reverseLockKey, 10, lockId)
        ]);
        
        // Double-check candidate is still available
        const [stillInQueue, alreadyMatched] = await Promise.all([
          redis.get(`matching:waiting_${candidateUserId}`),
          redis.get(`match:${candidateUserId}`)
        ]);
        
        if (!stillInQueue || alreadyMatched) {
          console.log(`[Skip] Candidate ${candidateUserId} no longer available`);
          await Promise.all([
            redis.del(lockKey),
            redis.del(reverseLockKey)
          ]);
          continue;
        }
        
        // Now we have exclusive access to match these users
        console.log(`[Skip] Lock acquired, matching: ${userToMatch} with ${candidateUserId}`);
        
        // Create room
        const sessionId = uuidv4();
        const roomName = `room_${sessionId}`;
        
        try {
          await createRoom(roomName);
          console.log(`[Skip] Created LiveKit room: ${roomName}`);
        } catch (error) {
          console.error('[Skip] Failed to create LiveKit room:', error);
          // Clean up locks
          await Promise.all([
            redis.del(lockKey),
            redis.del(reverseLockKey)
          ]);
          continue; // Try next candidate
        }
        
        // Store match info atomically
        const matchData = {
          sessionId,
          roomName,
          user1: userToMatch,
          user2: candidateUserId,
          createdAt: currentTime
        };
        
        const matchDataStr = JSON.stringify(matchData);
        // Execute all match operations in parallel
        await Promise.all([
          redis.setex(`match:${userToMatch}`, 300, matchDataStr),
          redis.setex(`match:${candidateUserId}`, 300, matchDataStr),
          // Remove any stale waiting-queue entries (they are now in a call)
          redis.del(`matching:waiting_${userToMatch}`),
          redis.del(`matching:waiting_${candidateUserId}`),
          // Mark both users as actively in a call
          redis.zadd('matching:in_call', currentTime, userToMatch),
          redis.zadd('matching:in_call', currentTime, candidateUserId),
          // Clear force-disconnect flags for both users
          redis.del(`force-disconnect:${userToMatch}`),
          redis.del(`force-disconnect:${candidateUserId}`),
          // Clean up locks
          redis.del(lockKey),
          redis.del(reverseLockKey),
          // Clear matching in progress flag
          redis.del(matchingInProgressKey)
        ]);
        
        console.log(`[Match] ${userToMatch} connected with ${candidateUserId}`);
        return { matched: true, matchData, peerId: candidateUserId };
      }
      
      // No match found, add to queue with a small delay to ensure clean state
      // Add grace period first to signal we're re-queuing
      await redis.setex(`requeue-grace:${userToMatch}`, 5, 'true');
      
      // Small delay to ensure all cleanup is propagated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now add to queue
      await redis.setex(`matching:waiting_${userToMatch}`, 300, currentTime.toString());
      
      // Verify they were added and clean
      const [verifyInQueue, verifyNoMatch, verifyNoInCall] = await Promise.all([
        redis.get(`matching:waiting_${userToMatch}`),
        redis.get(`match:${userToMatch}`),
        redis.zscore('matching:in_call', userToMatch)
      ]);
      
      console.log(`[Skip] No match found for ${userToMatch}, added to waiting queue. Status:`, {
        inQueue: verifyInQueue !== null,
        hasMatch: verifyNoMatch !== null,
        inCall: verifyNoInCall !== null
      });
      
      // Clear matching in progress flag
      await redis.del(matchingInProgressKey);
      
      return { matched: false };
      } catch (error) {
        // Always clear the matching in progress flag on error
        await redis.del(matchingInProgressKey);
        throw error;
      }
    }
    
    // Match users SEQUENTIALLY to prevent race conditions
    // First match the skipper
    console.log(`[Skip] Attempting to match skipper ${userId}, excluding ${otherUserId}`);
    try {
      matchResults.skipper = await tryMatchUser(userId, otherUserId || undefined);
      console.log(`[Skip] Skipper ${userId} match result:`, matchResults.skipper.matched ? 'matched' : 'queued');
    } catch (error) {
      console.error(`[Skip] Error matching skipper ${userId}:`, error);
      matchResults.skipper = { matched: false };
    }
    
    // Then match the other user if they exist (exclude the skipper)
    if (otherUserId) {
      // Small delay to prevent exact same timing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log(`[Skip] Attempting to match skipped user ${otherUserId}, excluding ${userId}`);
      try {
        matchResults.other = await tryMatchUser(otherUserId, userId);
        console.log(`[Skip] Skipped user ${otherUserId} match result:`, matchResults.other?.matched ? 'matched' : 'queued');
      } catch (error) {
        console.error(`[Skip] Error matching other user ${otherUserId}:`, error);
        matchResults.other = { matched: false };
      }
    }
    
    // === VERIFY CLEANUP ===
    const [verifyWaiting, verifyInCall, verifyMatch, verifyHeartbeat] = await Promise.all([
      redis.get(`matching:waiting_${userId}`),
      redis.zscore('matching:in_call', userId),
      redis.get(`match:${userId}`),
      redis.get(`heartbeat:${userId}`)
    ]);
    
    console.log(`[Skip] Final verification for ${userId}:`, {
      inWaiting: verifyWaiting !== null,
      inCall: verifyInCall !== null,
      hasMatch: verifyMatch !== null,
      hasHeartbeat: verifyHeartbeat !== null,
      skipperResult: matchResults.skipper
    });
    
    // Check final queue status for both users
    const [skipperInQueue, otherInQueue, skipperMatch, otherMatch, otherForceDisconnect] = await Promise.all([
      redis.get(`matching:waiting_${userId}`),
      otherUserId ? redis.get(`matching:waiting_${otherUserId}`) : null,
      redis.get(`match:${userId}`),
      otherUserId ? redis.get(`match:${otherUserId}`) : null,
      otherUserId ? redis.get(`force-disconnect:${otherUserId}`) : null
    ]);
    
    console.log(`[Skip] Final state summary:`, {
      skipper: {
        id: userId,
        inQueue: skipperInQueue !== null,
        hasMatch: skipperMatch !== null,
        matchResult: matchResults.skipper?.matched ? 'matched' : 'queued'
      },
      skippedUser: {
        id: otherUserId,
        inQueue: otherInQueue !== null,
        hasMatch: otherMatch !== null,
        matchResult: matchResults.other?.matched ? 'matched' : 'queued',
        forceDisconnectSet: otherForceDisconnect !== null
      }
    });
    
    return NextResponse.json({
      success: true,
      message: 'Session skipped',
      cleanup: {
        userId,
        otherUserId,
        roomDeleted: roomName !== null
      },
      matchResults: {
        skipper: matchResults.skipper,
        other: matchResults.other
      },
      queueStatus: {
        skipperInQueue: skipperInQueue !== null,
        otherInQueue: otherInQueue !== null
      }
    });
  } catch (error) {
    console.error('Error skipping session:', error);
    console.error('Error details:', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      userId,
      sessionId
    });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}