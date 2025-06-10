import { NextRequest, NextResponse } from 'next/server';
import { validateApiRequest, logRequestCompletion } from '@/lib/apiMiddleware';
import { stateManager } from '@/lib/stateManager';
import { v4 as uuidv4 } from 'uuid';
import { createRoom } from '@/lib/livekitService';
import redis from '@/lib/redis';

export async function POST(request: NextRequest) {
  const {
    valid,
    response,
    requestId,
    userId,
    startTime
  } = await validateApiRequest(request, '/api/simple-matching/enqueue');

  if (!valid) {
    return response;
  }

  // After this point, userId is guaranteed to be a string if requiresAuth is true
  const validatedUserId = userId!;

  try {
    const body = await request.json();
    console.log('[Enqueue] Request received:', { userId: validatedUserId, body });

    // Check if user is already in queue (but allow if they have requeue grace)
    const [inQueue, hasGrace] = await Promise.all([
      stateManager.isUserInState(validatedUserId, 'WAITING'),
      redis.get(`requeue-grace:${validatedUserId}`)
    ]);
    
    if (inQueue && !hasGrace) {
      const error = 'Already in queue';
      console.log(`[Enqueue] User ${validatedUserId} already in queue without grace period`);
      logRequestCompletion(requestId, '/api/simple-matching/enqueue', 'POST', validatedUserId, 'WAITING', startTime, false, error);
      return NextResponse.json(
        { success: false, error },
        { status: 400 }
      );
    }

    // Check if user is already in a match
    const existingMatch = await redis.get(`match:${validatedUserId}`);
    if (existingMatch) {
      const error = 'Already in a match';
      logRequestCompletion(requestId, '/api/simple-matching/enqueue', 'POST', validatedUserId, 'IN_CALL', startTime, false, error);
      return NextResponse.json(
        { success: false, error },
        { status: 400 }
      );
    }

    // Use the new state manager to find a match
    const waitingUsers = await stateManager.getOldestUsersInState('WAITING', 100);
    
    let matchedUserId: string | null = null;
    for (const candidate of waitingUsers) {
      if (candidate.userId === validatedUserId) continue;

      // Check for skip cooldown
      const cooldownKey = `skip-cooldown:${validatedUserId}:${candidate.userId}`;
      if (await redis.get(cooldownKey)) {
        continue;
      }
      
      // Attempt to lock this match
      const lockKey = `matchlock:${validatedUserId}:${candidate.userId}`;
      const lockAcquired = await redis.set(lockKey, 'locked', 'EX', 10, 'NX');

      if (lockAcquired) {
        // Double check candidate is still waiting
        if (await stateManager.isUserInState(candidate.userId, 'WAITING')) {
          matchedUserId = candidate.userId;
          break;
        } else {
          // Unlock if candidate is no longer available
          await redis.del(lockKey);
        }
      }
    }
    
    if (matchedUserId) {
      // Found a match!
      const sessionId = uuidv4();
      const roomName = `room_${sessionId}`;
      
      try {
        await createRoom(roomName);
      } catch (error) {
        console.error('Failed to create LiveKit room:', error);
        logRequestCompletion(requestId, '/api/simple-matching/enqueue', 'POST', validatedUserId, 'WAITING', startTime, false, 'Failed to create video room');
        return NextResponse.json(
          { success: false, error: 'Failed to create video room' },
          { status: 500 }
        );
      }
      
      const matchData = {
        sessionId,
        roomName,
        user1: validatedUserId,
        user2: matchedUserId,
        createdAt: Date.now()
      };
      
      // This logic should be moved to the state machine eventually
      await Promise.all([
        redis.setex(`match:${validatedUserId}`, 300, JSON.stringify(matchData)),
        redis.setex(`match:${matchedUserId}`, 300, JSON.stringify(matchData)),
        stateManager.moveUserBetweenStates(validatedUserId, 'IDLE', 'CONNECTING'),
        stateManager.moveUserBetweenStates(matchedUserId, 'WAITING', 'CONNECTING')
      ]);

      logRequestCompletion(requestId, '/api/simple-matching/enqueue', 'POST', validatedUserId, 'CONNECTING', startTime, true, undefined, { matchedWith: matchedUserId });
      return NextResponse.json({ success: true, matched: true, roomName });

    } else {
      // No match found, add user to waiting queue
      await stateManager.moveUserBetweenStates(validatedUserId, 'IDLE', 'WAITING');

      logRequestCompletion(requestId, '/api/simple-matching/enqueue', 'POST', validatedUserId, 'WAITING', startTime, true);
      return NextResponse.json({ success: true, matched: false });
    }

  } catch (error: any) {
    console.error('[Enqueue] Unhandled error:', error);
    logRequestCompletion(requestId, '/api/simple-matching/enqueue', 'POST', validatedUserId, null, startTime, false, error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}