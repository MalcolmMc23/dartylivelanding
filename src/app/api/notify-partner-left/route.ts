import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';

// Notify the remaining user that their partner has left
export async function POST(request: NextRequest) {
  try {
    const { remainingUser, roomName, disconnectedUser } = await request.json();
    
    console.log(`Notifying ${remainingUser} that ${disconnectedUser} left room ${roomName}`);
    
    if (!remainingUser || !roomName || !disconnectedUser) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    // Check if there's an active match for this room
    const roomInfo = await hybridMatchingService.getRoomInfo(roomName);
    
    if (!roomInfo?.isActive) {
      return NextResponse.json(
        { error: 'No active room found' },
        { status: 404 }
      );
    }
    
    // Get the remaining user's waiting status to see if they've been matched already
    const waitingStatus = await hybridMatchingService.getWaitingQueueStatus(remainingUser);
    
    return NextResponse.json({
      status: 'partner_left',
      remainingUser,
      disconnectedUser,
      roomName,
      waitingStatus: waitingStatus?.status || 'unknown',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error notifying partner left:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 