import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();
    console.log('[Check-match] Checking for userId:', userId);

    if (!userId) {
      console.error('[Check-match] No userId provided');
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    // Check if user has been matched
    const matchKey = `match:${userId}`;
    const matchData = await redis.get(matchKey);
    console.log('[Check-match] Looking for match key:', matchKey, 'Found:', !!matchData);
    
    if (matchData) {
      const match = JSON.parse(matchData);
      const peerId = match.user1 === userId ? match.user2 : match.user1;
      
      // Verify the peer still exists in the match (they might have skipped)
      const peerMatch = await redis.get(`match:${peerId}`);
      if (!peerMatch) {
        // Peer has left, clean up our match data
        console.log('[Check-match] Peer has left, cleaning up stale match data');
        await redis.del(matchKey);
        await redis.zrem('matching:in_call', userId);
      } else {
        console.log('[Check-match] Found valid match for user:', userId, 'with peer:', peerId);
        
        // Don't clear force-disconnect flag here - let the client handle it after acknowledging
        
        return NextResponse.json({
          success: true,
          matched: true,
          data: {
            sessionId: match.sessionId,
            roomName: match.roomName,
            peerId
          }
        });
      }
    }

    // Check if still in queue
    const inQueue = await redis.zscore('matching:waiting', userId);
    
    // Also check if user is in call
    const inCall = await redis.zscore('matching:in_call', userId);
    
    console.log('[Check-match] User', userId, 'status - In queue:', inQueue !== null, 'In call:', inCall !== null);
    
    return NextResponse.json({
      success: true,
      matched: false,
      inQueue: inQueue !== null
    });
  } catch (error) {
    console.error('Error checking match:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}