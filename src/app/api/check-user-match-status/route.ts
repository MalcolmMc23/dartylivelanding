import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { ACTIVE_MATCHES } from '@/utils/redis/constants';
import { ActiveMatch } from '@/utils/redis/types';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();
    
    if (!username) {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 });
    }
    
    console.log(`Checking match status for user: ${username}`);
    
    // Check if user is in an active match
    const allMatches = await redis.hgetall(ACTIVE_MATCHES);
    
    for (const [roomName, matchData] of Object.entries(allMatches)) {
      try {
        const match = JSON.parse(matchData as string) as ActiveMatch;
        
        if (match.user1 === username || match.user2 === username) {
          const matchedWith = match.user1 === username ? match.user2 : match.user1;
          
          console.log(`User ${username} is matched with ${matchedWith} in room ${roomName}`);
          
          return NextResponse.json({
            status: 'matched',
            roomName,
            matchedWith,
            useDemo: match.useDemo || false,
            matchedAt: match.matchedAt
          });
        }
      } catch (e) {
        console.error('Error parsing match data:', e);
      }
    }
    
    // User is not matched
    return NextResponse.json({
      status: 'waiting',
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error checking user match status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 