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

    // Check if user is already in queue
    const inQueue = await redis.zscore('matching:waiting', userId);
    if (inQueue !== null) {
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

    // Clean up stale users before matching
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds
    const allWaitingUsers = await redis.zrange('matching:waiting', 0, -1);
    
    for (const waitingUser of allWaitingUsers) {
      const heartbeat = await redis.get(`heartbeat:${waitingUser}`);
      if (!heartbeat || (now - parseInt(heartbeat)) > staleThreshold) {
        await redis.zrem('matching:waiting', waitingUser);
        await redis.del(`heartbeat:${waitingUser}`);
        console.log(`Removed stale user ${waitingUser} from queue`);
      }
    }
    
    // Get fresh list of waiting users
    const waitingUsers = await redis.zrange('matching:waiting', 0, -1);
    
    // Try each waiting user until we find a valid match
    let matchedUserId = null;
    for (const candidateUserId of waitingUsers) {
      // Skip if it's the same user
      if (candidateUserId === userId) continue;
      
      // Check if candidate has a recent heartbeat
      const heartbeat = await redis.get(`heartbeat:${candidateUserId}`);
      if (!heartbeat || (now - parseInt(heartbeat)) > 30000) {
        // Remove stale user
        await redis.zrem('matching:waiting', candidateUserId);
        await redis.del(`heartbeat:${candidateUserId}`);
        console.log(`Removed stale candidate ${candidateUserId}`);
        continue;
      }
      
      // Double-check the candidate isn't already in a call
      const candidateMatch = await redis.get(`match:${candidateUserId}`);
      if (candidateMatch) {
        // User already matched, remove from queue and try next
        await redis.zrem('matching:waiting', candidateUserId);
        console.log(`Candidate ${candidateUserId} already in a match, removing from queue`);
        continue;
      }
      
      // Valid candidate found
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
      
      // Store match info in Redis for both users BEFORE removing from queue
      const matchData = {
        sessionId,
        roomName,
        user1: userId,
        user2: matchedUserId,
        createdAt: Date.now()
      };
      
      // Store match data for both users to retrieve
      await redis.setex(`match:${userId}`, 300, JSON.stringify(matchData));
      await redis.setex(`match:${matchedUserId}`, 300, JSON.stringify(matchData));
      
      // Add both users to in_call set
      await redis.zadd('matching:in_call', Date.now(), userId);
      await redis.zadd('matching:in_call', Date.now(), matchedUserId);
      
      // NOW remove matched user from queue (after match data is stored)
      await redis.zrem('matching:waiting', matchedUserId);
      
      // Verify the data was stored
      const verifyUser1 = await redis.get(`match:${userId}`);
      const verifyUser2 = await redis.get(`match:${matchedUserId}`);
      console.log(`[Enqueue] Stored match data - User1 (${userId}):`, !!verifyUser1, `User2 (${matchedUserId}):`, !!verifyUser2);
      
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