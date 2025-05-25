import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

const ALONE_USER_TRACKING = 'alone_user_tracking';
const ROOM_OCCUPANCY_KEY = 'room_occupancy';

export async function GET() {
  try {
    // Get all users being tracked as alone
    const aloneUsers = await redis.hgetall(ALONE_USER_TRACKING);
    
    // Get room occupancy data
    const roomOccupancy = await redis.hgetall(ROOM_OCCUPANCY_KEY);
    
    const now = Date.now();
    const processedAloneUsers = Object.entries(aloneUsers).map(([username, dataStr]) => {
      try {
        const data = JSON.parse(dataStr);
        return {
          username,
          roomName: data.roomName,
          aloneStartTime: data.aloneStartTime,
          timeAlone: now - data.aloneStartTime,
          useDemo: data.useDemo,
          lastChecked: data.lastChecked,
          shouldReset: (now - data.aloneStartTime) >= 5000 // 5 seconds
        };
      } catch {
        return {
          username,
          error: 'Failed to parse data',
          rawData: dataStr
        };
      }
    });
    
    const processedRoomOccupancy = Object.entries(roomOccupancy).map(([roomName, dataStr]) => {
      try {
        const data = JSON.parse(dataStr);
        return {
          roomName,
          participants: data.participants,
          participantCount: data.participants.length,
          lastUpdated: data.lastUpdated,
          isActive: data.isActive,
          timeSinceUpdate: now - data.lastUpdated
        };
      } catch {
        return {
          roomName,
          error: 'Failed to parse data',
          rawData: dataStr
        };
      }
    });
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      aloneUsers: processedAloneUsers,
      roomOccupancy: processedRoomOccupancy,
      summary: {
        totalAloneUsers: processedAloneUsers.length,
        usersReadyForReset: processedAloneUsers.filter(u => u.shouldReset).length,
        totalRooms: processedRoomOccupancy.length,
        singleOccupancyRooms: processedRoomOccupancy.filter(r => r.participantCount === 1).length,
        aloneUsersDetails: processedAloneUsers.map(u => ({
          username: u.username,
          timeAlone: u.timeAlone,
          shouldReset: u.shouldReset
        }))
      }
    });
  } catch (error) {
    console.error('Error getting alone users debug info:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: String(error)
      },
      { status: 500 }
    );
  }
} 