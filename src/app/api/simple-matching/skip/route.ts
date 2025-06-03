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

    // === CLEANUP BOTH USERS (Optimized with parallel operations) ===
    console.log(`[Skip] Cleaning up both users: ${userId} and ${otherUserId}`);
    
    // Prepare cleanup operations
    const cleanupOps = [
      // Clean up current user (skipper)
      redis.zrem('matching:waiting', userId),
      redis.zrem('matching:in_call', userId),
      redis.del(`match:${userId}`),
      redis.del(`force-disconnect:${userId}`),
      redis.del(`heartbeat:${userId}`),
      redis.del(`requeue-grace:${userId}`)
    ];
    
    // Add other user cleanup if exists
    if (otherUserId) {
      cleanupOps.push(
        redis.zrem('matching:waiting', otherUserId),
        redis.zrem('matching:in_call', otherUserId),
        redis.del(`match:${otherUserId}`),
        redis.del(`heartbeat:${otherUserId}`),
        redis.del(`requeue-grace:${otherUserId}`)
      );
    }
    
    // Execute all cleanup operations in parallel
    await Promise.all(cleanupOps);
    
    // Set force-disconnect separately (different return type)
    if (otherUserId) {
      await redis.setex(`force-disconnect:${otherUserId}`, 30, 'true');
    }
    console.log(`[Skip] Cleanup completed for both users`);

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
      // Check if user has recent heartbeat (use current time for check)
      const currentTime = Date.now();
      const userHeartbeat = await redis.get(`heartbeat:${userToMatch}`);
      if (!userHeartbeat || (currentTime - parseInt(userHeartbeat)) > 30000) {
        console.log(`[Skip] User ${userToMatch} heartbeat is stale, not re-queuing`);
        return { matched: false };
      }
      
      // Refresh heartbeat to prevent immediate cleanup
      await redis.setex(`heartbeat:${userToMatch}`, 30, currentTime.toString());
      
      // Get all waiting users with scores for age filtering
      const waitingUsersWithScores = await redis.zrange('matching:waiting', 0, -1, 'WITHSCORES');
      const waitingUsers = [];
      
      // Process users and filter stale ones
      for (let i = 0; i < waitingUsersWithScores.length; i += 2) {
        const candidateUserId = waitingUsersWithScores[i];
        const joinTime = parseInt(waitingUsersWithScores[i + 1]);
        
        // Skip if too old in queue (> 1 minute)
        if (currentTime - joinTime > 60000) {
          await redis.zrem('matching:waiting', candidateUserId);
          continue;
        }
        
        // Skip if it's the same user or the excluded user
        if (candidateUserId === userToMatch || candidateUserId === excludeUserId) continue;
        
        waitingUsers.push(candidateUserId);
      }
      
      console.log(`[Skip] Found ${waitingUsers.length} potential matches for ${userToMatch}`);
      
      // Try to find a match from filtered list
      for (const candidateUserId of waitingUsers) {
        // Batch check heartbeat and existing match
        const [candidateHeartbeat, candidateMatch] = await Promise.all([
          redis.get(`heartbeat:${candidateUserId}`),
          redis.get(`match:${candidateUserId}`)
        ]);
        
        // Check heartbeat
        if (!candidateHeartbeat || (currentTime - parseInt(candidateHeartbeat)) > 30000) {
          await redis.zrem('matching:waiting', candidateUserId);
          await redis.del(`heartbeat:${candidateUserId}`);
          continue;
        }
        
        // Check if already matched
        if (candidateMatch) {
          await redis.zrem('matching:waiting', candidateUserId);
          continue;
        }
        
        // Found a valid match!
        console.log(`[Skip] Found match: ${userToMatch} with ${candidateUserId}`);
        
        // Create room
        const sessionId = uuidv4();
        const roomName = `room_${sessionId}`;
        
        try {
          await createRoom(roomName);
          console.log(`[Skip] Created LiveKit room: ${roomName}`);
        } catch (error) {
          console.error('[Skip] Failed to create LiveKit room:', error);
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
          redis.zadd('matching:in_call', currentTime, userToMatch),
          redis.zadd('matching:in_call', currentTime, candidateUserId),
          redis.zrem('matching:waiting', candidateUserId)
        ]);
        
        return { matched: true, matchData, peerId: candidateUserId };
      }
      
      // No match found, add to queue with a small delay to ensure clean state
      // Add grace period first to signal we're re-queuing
      await redis.setex(`requeue-grace:${userToMatch}`, 5, 'true');
      
      // Small delay to ensure all cleanup is propagated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now add to queue
      await redis.zadd('matching:waiting', currentTime, userToMatch);
      
      // Verify they were added and clean
      const [verifyInQueue, verifyNoMatch, verifyNoInCall] = await Promise.all([
        redis.zscore('matching:waiting', userToMatch),
        redis.get(`match:${userToMatch}`),
        redis.zscore('matching:in_call', userToMatch)
      ]);
      
      console.log(`[Skip] No match found for ${userToMatch}, added to waiting queue. Status:`, {
        inQueue: verifyInQueue !== null,
        hasMatch: verifyNoMatch !== null,
        inCall: verifyNoInCall !== null
      });
      
      return { matched: false };
    }
    
    // Try to match both users in parallel for efficiency
    const matchPromises = [];
    
    // Match the skipper (exclude their previous partner)
    matchPromises.push(
      tryMatchUser(userId, otherUserId || undefined)
        .then(result => { matchResults.skipper = result; })
        .catch(error => {
          console.error(`[Skip] Error matching skipper ${userId}:`, error);
          matchResults.skipper = { matched: false };
        })
    );
    
    // Match the other user if they exist (exclude the skipper)
    if (otherUserId) {
      matchPromises.push(
        tryMatchUser(otherUserId, userId)
          .then(result => { matchResults.other = result; })
          .catch(error => {
            console.error(`[Skip] Error matching other user ${otherUserId}:`, error);
            matchResults.other = { matched: false };
          })
      );
    }
    
    // Wait for both matching attempts to complete
    await Promise.all(matchPromises);

    // === DELETE LIVEKIT ROOM ===
    if (roomName) {
      console.log(`[Skip] Deleting LiveKit room: ${roomName}`);
      try {
        await deleteRoom(roomName);
      } catch (error) {
        console.error('Error deleting LiveKit room:', error);
      }
    }
    
    // === VERIFY CLEANUP ===
    const [verifyWaiting, verifyInCall, verifyMatch, verifyHeartbeat] = await Promise.all([
      redis.zscore('matching:waiting', userId),
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
    const [skipperInQueue, otherInQueue] = await Promise.all([
      redis.zscore('matching:waiting', userId),
      otherUserId ? redis.zscore('matching:waiting', otherUserId) : null
    ]);
    
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