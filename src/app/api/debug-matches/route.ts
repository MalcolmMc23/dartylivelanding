import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { ACTIVE_MATCHES } from '@/utils/redis/constants';
import { isUserInValidMatch, validateMatch } from '@/utils/redis/matchValidator';

const ROOM_OCCUPANCY_KEY = 'room_occupancy';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const username = url.searchParams.get('username');
    
    // Get all active matches
    const allMatches = await redis.hgetall(ACTIVE_MATCHES);
    
    // Get all room occupancy data
    const allOccupancy = await redis.hgetall(ROOM_OCCUPANCY_KEY);
    
    const matchDetails = [];
    
    for (const [roomName, matchDataStr] of Object.entries(allMatches)) {
      try {
        const match = JSON.parse(matchDataStr);
        const occupancyData = allOccupancy[roomName];
        
        let occupancy = null;
        if (occupancyData) {
          occupancy = JSON.parse(occupancyData);
        }
        
        const isValid = await validateMatch(roomName);
        
        matchDetails.push({
          roomName,
          match,
          occupancy,
          isValid,
          participants: occupancy?.participants || [],
          participantCount: occupancy?.participants?.length || 0,
          user1InRoom: occupancy?.participants?.includes(match.user1) || false,
          user2InRoom: occupancy?.participants?.includes(match.user2) || false,
          matchAge: Date.now() - match.matchedAt,
          lastUpdated: occupancy?.lastUpdated || null
        });
      } catch (error) {
        matchDetails.push({
          roomName,
          error: `Error parsing data: ${error}`,
          rawMatch: matchDataStr,
          rawOccupancy: allOccupancy[roomName]
        });
      }
    }
    
    let userValidation = null;
    if (username) {
      userValidation = await isUserInValidMatch(username);
    }
    
    return NextResponse.json({
      totalMatches: Object.keys(allMatches).length,
      totalRooms: Object.keys(allOccupancy).length,
      userValidation,
      matchDetails,
      summary: {
        validMatches: matchDetails.filter(m => m.isValid).length,
        invalidMatches: matchDetails.filter(m => m.isValid === false).length,
        usersAlone: matchDetails.filter(m => m.participantCount === 1).length,
        emptyRooms: matchDetails.filter(m => m.participantCount === 0).length,
        fullRooms: matchDetails.filter(m => m.participantCount === 2).length
      }
    });
    
  } catch (error) {
    console.error('Error in debug-matches API:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: String(error) 
      }, 
      { status: 500 }
    );
  }
} 