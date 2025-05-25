import { NextRequest, NextResponse } from 'next/server';
import { WebhookReceiver } from 'livekit-server-sdk';
import { handleParticipantJoined, handleParticipantLeft } from '@/utils/redis/roomSyncManager';
import * as hybridMatchingService from '@/utils/hybridMatchingService';

// Initialize webhook receiver
const webhookReceiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY || '',
  process.env.LIVEKIT_API_SECRET || ''
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      console.error('Missing authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify webhook signature
    const event = await webhookReceiver.receive(body, authHeader);
    
    console.log(`LiveKit webhook event: ${event.event} for room ${event.room?.name}`);

    switch (event.event) {
      case 'participant_joined':
        if (event.room && event.participant) {
          await handleParticipantJoined(
            event.room.name,
            event.participant.identity,
            event.participant.metadata
          );
          
          console.log(`Participant ${event.participant.identity} joined room ${event.room.name}`);
        }
        break;

      case 'participant_left':
        if (event.room && event.participant) {
          await handleParticipantLeft(
            event.room.name,
            event.participant.identity
          );
          
          // Check if this was an unexpected disconnect and handle accordingly
          await handleUnexpectedDisconnect(
            event.room.name,
            event.participant.identity
          );
          
          console.log(`Participant ${event.participant.identity} left room ${event.room.name}`);
        }
        break;

      case 'room_finished':
        if (event.room) {
          await handleRoomFinished(event.room.name);
          console.log(`Room ${event.room.name} finished`);
        }
        break;

      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing LiveKit webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Handle unexpected participant disconnect
 */
async function handleUnexpectedDisconnect(
  roomName: string,
  participantIdentity: string
) {
  try {
    // Check if there's an active match for this room
    const result = await hybridMatchingService.handleUserDisconnection(
      participantIdentity,
      roomName
    );
    
    console.log(`Handled unexpected disconnect for ${participantIdentity}:`, result);
  } catch (error) {
    console.error(`Error handling unexpected disconnect for ${participantIdentity}:`, error);
  }
}

/**
 * Handle room finished event
 */
async function handleRoomFinished(roomName: string) {
  try {
    // Clean up any remaining match data
    await hybridMatchingService.cleanupRoom(roomName);
    console.log(`Cleaned up finished room: ${roomName}`);
  } catch (error) {
    console.error(`Error cleaning up finished room ${roomName}:`, error);
  }
} 