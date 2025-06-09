import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getRoom, listParticipants } from '@/lib/livekitService';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    // Get user's current match data
    const matchData = await redis.get(`match:${userId}`);
    
    if (!matchData) {
      // User is not in a match
      return NextResponse.json({
        success: true,
        isAlone: false,
        reason: 'not_in_match'
      });
    }

    const match = JSON.parse(matchData);
    const { roomName, user1, user2 } = match;
    const otherUserId = user1 === userId ? user2 : user1;

    // Check if the room still exists in LiveKit
    const room = await getRoom(roomName);
    
    if (!room) {
      // Room doesn't exist - user is effectively alone
      console.log(`[CheckAlone] Room ${roomName} doesn't exist - user ${userId} is alone`);
      return NextResponse.json({
        success: true,
        isAlone: true,
        reason: 'room_deleted'
      });
    }

    // Check participants in the room
    const participants = await listParticipants(roomName);
    const participantIds = participants.map(p => p.identity);
    
    // Check if user is in the room
    if (!participantIds.includes(userId)) {
      // User is not even in the room yet
      return NextResponse.json({
        success: true,
        isAlone: false,
        reason: 'not_joined_yet'
      });
    }

    // Check if the other user is in the room
    if (!participantIds.includes(otherUserId)) {
      // Other user is not in the room - check their status
      const [otherUserMatch, otherUserHeartbeat, forceDisconnect] = await Promise.all([
        redis.get(`match:${otherUserId}`),
        redis.get(`heartbeat:${otherUserId}`),
        redis.get(`force-disconnect:${userId}`)
      ]);

      // If we already have a force-disconnect flag, we're being handled
      if (forceDisconnect) {
        return NextResponse.json({
          success: true,
          isAlone: false,
          reason: 'force_disconnect_pending'
        });
      }

      // Check if other user still has same match
      if (!otherUserMatch || JSON.parse(otherUserMatch).roomName !== roomName) {
        // Other user has different/no match - they've moved on
        console.log(`[CheckAlone] Other user ${otherUserId} has moved on - user ${userId} is alone`);
        return NextResponse.json({
          success: true,
          isAlone: true,
          reason: 'partner_left'
        });
      }

      // Check if other user's heartbeat is stale (> 15 seconds)
      const now = Date.now();
      if (!otherUserHeartbeat || (now - parseInt(otherUserHeartbeat)) > 15000) {
        console.log(`[CheckAlone] Other user ${otherUserId} heartbeat stale - user ${userId} is alone`);
        return NextResponse.json({
          success: true,
          isAlone: true,
          reason: 'partner_disconnected'
        });
      }

      // Other user might just be slow to join
      return NextResponse.json({
        success: true,
        isAlone: false,
        reason: 'partner_not_joined_yet'
      });
    }

    // Both users are in the room
    return NextResponse.json({
      success: true,
      isAlone: false,
      reason: 'both_in_room',
      participantCount: participants.length
    });

  } catch (error) {
    console.error('[CheckAlone] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}