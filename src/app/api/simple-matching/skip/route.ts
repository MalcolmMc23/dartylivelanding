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

    // === CLEANUP BOTH USERS ===
    console.log(`[Skip] Cleaning up both users: ${userId} and ${otherUserId}`);
    
    // Clean up current user (skipper)
    await redis.zrem('matching:waiting', userId);
    await redis.zrem('matching:in_call', userId);
    await redis.del(`match:${userId}`);
    await redis.del(`force-disconnect:${userId}`);
    console.log(`[Skip] Cleaned up state for user ${userId}`);

    // Clean up other user if exists
    if (otherUserId) {
      await redis.zrem('matching:waiting', otherUserId);
      await redis.zrem('matching:in_call', otherUserId);
      await redis.del(`match:${otherUserId}`);
      
      // Mark other user as force disconnected so they get kicked from the room
      await redis.setex(`force-disconnect:${otherUserId}`, 30, 'true');
      console.log(`[Skip] Cleaned up state for other user ${otherUserId}`);
    }

    // === TRY TO MATCH BOTH USERS WITH OTHERS IN QUEUE ===
    const now = Date.now();
    const matchResults: {
      skipper?: TryMatchUserResult;
      other?: TryMatchUserResult;
    } = {};
    
    // Helper function to try matching a user
    async function tryMatchUser(userToMatch: string, excludeUserId?: string): Promise<TryMatchUserResult> {
      // Check if user has recent heartbeat
      const userHeartbeat = await redis.get(`heartbeat:${userToMatch}`);
      if (!userHeartbeat || (now - parseInt(userHeartbeat)) > 30000) {
        console.log(`[Skip] User ${userToMatch} heartbeat is stale, not re-queuing`);
        return { matched: false };
      }
      
      // Refresh heartbeat to prevent immediate cleanup
      await redis.setex(`heartbeat:${userToMatch}`, 30, now.toString());
      
      // Get all waiting users
      const waitingUsers = await redis.zrange('matching:waiting', 0, -1);
      console.log(`[Skip] Trying to match ${userToMatch}. Waiting users in queue:`, waitingUsers);
      console.log(`[Skip] Excluding: ${excludeUserId || 'none'}`);
      
      // Try to find a match
      for (const candidateUserId of waitingUsers) {
        // Skip if it's the same user or the excluded user (previous partner)
        if (candidateUserId === userToMatch || candidateUserId === excludeUserId) continue;
        
        // Check if candidate has a recent heartbeat
        const candidateHeartbeat = await redis.get(`heartbeat:${candidateUserId}`);
        if (!candidateHeartbeat || (now - parseInt(candidateHeartbeat)) > 30000) {
          // Remove stale user
          await redis.zrem('matching:waiting', candidateUserId);
          await redis.del(`heartbeat:${candidateUserId}`);
          console.log(`[Skip] Removed stale candidate ${candidateUserId}`);
          continue;
        }
        
        // Double-check the candidate isn't already in a call
        const candidateMatch = await redis.get(`match:${candidateUserId}`);
        if (candidateMatch) {
          // User already matched, remove from queue
          await redis.zrem('matching:waiting', candidateUserId);
          console.log(`[Skip] Candidate ${candidateUserId} already in a match, removing from queue`);
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
        
        // Store match info
        const matchData = {
          sessionId,
          roomName,
          user1: userToMatch,
          user2: candidateUserId,
          createdAt: Date.now()
        };
        
        await redis.setex(`match:${userToMatch}`, 300, JSON.stringify(matchData));
        await redis.setex(`match:${candidateUserId}`, 300, JSON.stringify(matchData));
        
        // Add both to in_call set
        await redis.zadd('matching:in_call', Date.now(), userToMatch);
        await redis.zadd('matching:in_call', Date.now(), candidateUserId);
        
        // Remove matched user from queue
        await redis.zrem('matching:waiting', candidateUserId);
        
        return { matched: true, matchData, peerId: candidateUserId };
      }
      
      // No match found, add to queue
      await redis.zadd('matching:waiting', Date.now(), userToMatch);
      // Add grace period to prevent race condition with cleanup
      await redis.setex(`requeue-grace:${userToMatch}`, 15, 'true');
      
      // Verify they were added
      const verifyInQueue = await redis.zscore('matching:waiting', userToMatch);
      console.log(`[Skip] No match found for ${userToMatch}, added to waiting queue. Verified in queue: ${verifyInQueue !== null}`);
      
      return { matched: false };
    }
    
    // Try to match the skipper (exclude their previous partner)
    try {
      matchResults.skipper = await tryMatchUser(userId, otherUserId || undefined);
    } catch (error) {
      console.error(`[Skip] Error matching skipper ${userId}:`, error);
      matchResults.skipper = { matched: false };
    }
    
    // Try to match the other user if they exist (exclude the skipper)
    if (otherUserId) {
      try {
        matchResults.other = await tryMatchUser(otherUserId, userId);
      } catch (error) {
        console.error(`[Skip] Error matching other user ${otherUserId}:`, error);
        matchResults.other = { matched: false };
      }
    }

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
    const verifyWaiting = await redis.zscore('matching:waiting', userId);
    const verifyInCall = await redis.zscore('matching:in_call', userId);
    const verifyMatch = await redis.get(`match:${userId}`);
    
    console.log(`[Skip] Verification for ${userId}:`, {
      inWaiting: verifyWaiting !== null,
      inCall: verifyInCall !== null,
      hasMatch: verifyMatch !== null
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