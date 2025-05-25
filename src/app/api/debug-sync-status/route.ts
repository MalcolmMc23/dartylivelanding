import { NextResponse } from 'next/server';
import { getAllLiveKitRooms } from '@/utils/livekit-sync/roomSyncService';
import redis from '@/lib/redis';
import { ACTIVE_MATCHES } from '@/utils/redis/constants';

export async function GET() {
  try {
    console.log('Checking LiveKit-Redis sync status');

    // Get LiveKit rooms
    const liveKitRooms = await getAllLiveKitRooms();
    
    // Get Redis matches
    const redisMatches = await redis.hgetall(ACTIVE_MATCHES);
    
    // Parse Redis matches
    const parsedRedisMatches = Object.entries(redisMatches).map(([roomName, matchData]) => {
      try {
        const match = JSON.parse(matchData);
        return {
          roomName,
          users: [match.user1, match.user2],
          matchedAt: match.matchedAt,
          useDemo: match.useDemo
        };
      } catch {
        return {
          roomName,
          users: [],
          error: 'Failed to parse match data'
        };
      }
    });

    // Find discrepancies
    const discrepancies = [];
    
    // Check LiveKit rooms that don't have Redis matches
    for (const liveKitRoom of liveKitRooms) {
      if (liveKitRoom.participantCount > 0) {
        const redisMatch = parsedRedisMatches.find(m => m.roomName === liveKitRoom.roomName);
        
        if (!redisMatch) {
          discrepancies.push({
            type: 'missing_redis_match',
            roomName: liveKitRoom.roomName,
            liveKitParticipants: liveKitRoom.participants,
            liveKitCount: liveKitRoom.participantCount,
            redisMatch: null
          });
        } else if (liveKitRoom.participantCount === 2) {
          // Check if participants match
          const liveKitUsers = liveKitRoom.participants.sort();
          const redisUsers = redisMatch.users.sort();
          
          if (JSON.stringify(liveKitUsers) !== JSON.stringify(redisUsers)) {
            discrepancies.push({
              type: 'participant_mismatch',
              roomName: liveKitRoom.roomName,
              liveKitParticipants: liveKitUsers,
              redisParticipants: redisUsers
            });
          }
        } else if (liveKitRoom.participantCount === 1) {
          discrepancies.push({
            type: 'single_participant_with_match',
            roomName: liveKitRoom.roomName,
            liveKitParticipants: liveKitRoom.participants,
            redisMatch: redisMatch.users
          });
        }
      }
    }
    
    // Check Redis matches that don't have LiveKit rooms
    for (const redisMatch of parsedRedisMatches) {
      const liveKitRoom = liveKitRooms.find(r => r.roomName === redisMatch.roomName);
      
      if (!liveKitRoom || liveKitRoom.participantCount === 0) {
        discrepancies.push({
          type: 'orphaned_redis_match',
          roomName: redisMatch.roomName,
          redisParticipants: redisMatch.users,
          liveKitRoom: liveKitRoom ? 'empty' : 'not_found'
        });
      }
    }

    const status = {
      timestamp: new Date().toISOString(),
      liveKitRooms: liveKitRooms.length,
      redisMatches: parsedRedisMatches.length,
      discrepancies: discrepancies.length,
      isInSync: discrepancies.length === 0,
      details: {
        liveKitRooms: liveKitRooms.map(room => ({
          roomName: room.roomName,
          participantCount: room.participantCount,
          participants: room.participants
        })),
        redisMatches: parsedRedisMatches,
        discrepancies
      }
    };

    return NextResponse.json(status);

  } catch (error) {
    console.error('Error checking sync status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check sync status',
        details: String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 