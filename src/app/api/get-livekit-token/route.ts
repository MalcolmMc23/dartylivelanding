import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const room = searchParams.get('room');
    const username = searchParams.get('username');

    if (!room || !username) {
      return NextResponse.json(
        { error: 'Missing room or username' },
        { status: 400 }
      );
    }

    // Create a new access token
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    // Debug log - masked for security
    console.log('API Key defined:', !!apiKey);
    console.log('API Secret defined:', !!apiSecret);
    console.log('API Key first 4 chars:', apiKey?.substring(0, 4));

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'LiveKit credentials not configured' },
        { status: 500 }
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: username,
    });

    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    const token = at.toJwt();

    // Return debugging info with the token
    return NextResponse.json({ 
      token,
      debug: {
        room,
        username,
        apiKeyDefined: !!apiKey,
        secretDefined: !!apiSecret,
        tokenGenerated: !!token
      }
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json(
      { error: `Failed to generate token: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
} 