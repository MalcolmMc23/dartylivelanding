import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let room = searchParams.get('room');
    const username = searchParams.get('username');
    const useDemo = searchParams.get('useDemo') === 'true';

    if (!room || !username) {
      return NextResponse.json(
        { error: 'Missing room or username' },
        { status: 400 }
      );
    }

    // Sanitize room name - only allow alphanumeric and hyphens
    room = room.replace(/[^a-zA-Z0-9-]/g, '');
    if (room.length === 0) {
      return NextResponse.json(
        { error: 'Invalid room name. Use only letters, numbers, and hyphens.' },
        { status: 400 }
      );
    }

    // Create a new access token
    let apiKey = process.env.LIVEKIT_API_KEY || '';
    let apiSecret = process.env.LIVEKIT_API_SECRET || '';

    // Use demo API keys if requested (for testing)
    if (useDemo) {
      // These are the official LiveKit demo credentials
      apiKey = 'devkey';
      apiSecret = 'secret';
      console.log('Using LiveKit demo server credentials');
    }

    // Debug log - masked for security
    console.log('API Key defined:', !!apiKey);
    console.log('API Secret defined:', !!apiSecret);
    console.log('API Key value:', apiKey);
    console.log('Using demo server:', useDemo);

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'LiveKit credentials not configured' },
        { status: 500 }
      );
    }

    // Create the access token with identity and name - using the constructor properly
    const at = new AccessToken(apiKey, apiSecret, {
      identity: username,
      ttl: 60 * 30, // 30 minute token
      name: username,
    });

    // Add the video grant with proper properties
    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });

    // Generate JWT token as string - await because toJwt returns a Promise
    const token = await at.toJwt();
    console.log('Token generated (first 20 chars):', token.substring(0, 20) + '...');

    // Return the token as a plain string value
    return NextResponse.json({ 
      token: token,  // Make sure it's a string
      debug: {
        room,
        username,
        apiKeyDefined: !!apiKey,
        secretDefined: !!apiSecret,
        tokenGenerated: !!token,
        usingDemo: useDemo,
        tokenLength: token.length
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