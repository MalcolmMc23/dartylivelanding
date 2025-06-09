import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { deleteRoom, listAllRooms, listParticipants } from '@/lib/livekitService';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', {
      status: 401,
    });
  }

  try {
    const cleanedUpUsers: string[] = [];
    const cleanedUpRooms: string[] = [];

    // --- New Ghost Session Cleanup Logic ---
    const allRooms = await listAllRooms();

    for (const room of allRooms) {
      if (room.numParticipants < 2) {
        console.log(`[Cleanup] Found ghost room ${room.name} with ${room.numParticipants} participants. Cleaning up.`);
        
        // If there's one participant, try to get their ID to clean up their state
        if (room.numParticipants === 1) {
          const participants = await listParticipants(room.name);
          if (participants.length > 0) {
            const loneUserId = participants[0].identity;
            await redis.zrem('matching:in_call', loneUserId);
            await redis.del(`match:${loneUserId}`);
            cleanedUpUsers.push(loneUserId);
          }
        }
        
        // Delete the ghost room
        await deleteRoom(room.name);
        cleanedUpRooms.push(room.name);
      }
    }

    // --- Original Heartbeat Cleanup Logic ---
    const usersInCall = await redis.zrange('matching:in_call', 0, -1);

    for (const userId of usersInCall) {
      const matchData = await redis.get(`match:${userId}`);
      if (!matchData) {
        console.log(`[Cleanup] User ${userId} in 'in_call' but has no match data. Cleaning up.`);
        await redis.zrem('matching:in_call', userId);
        cleanedUpUsers.push(userId);
        continue;
      }

      const match = JSON.parse(matchData);
      const { roomName, user1, user2 } = match;
      const otherUserId = user1 === userId ? user2 : user1;

      const partnerHeartbeat = await redis.get(`heartbeat:${otherUserId}`);

      if (!partnerHeartbeat) {
        console.log(`[Cleanup] User ${userId}'s partner (${otherUserId}) has no heartbeat. Cleaning up.`);

        await redis.zrem('matching:in_call', userId);
        await redis.del(`match:${userId}`);
        
        // Check if room wasn't already cleaned up
        if (!cleanedUpRooms.includes(roomName)) {
           await deleteRoom(roomName);
           cleanedUpRooms.push(roomName);
        }

        cleanedUpUsers.push(userId);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleanup complete. ${cleanedUpUsers.length} users and ${cleanedUpRooms.length} rooms cleaned up.`,
      cleanedUpUsers: [...new Set(cleanedUpUsers)], // Remove duplicates
      cleanedUpRooms,
    });

  } catch (error) {
    console.error('[Cleanup] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}