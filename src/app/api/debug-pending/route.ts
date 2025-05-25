import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { PendingMatch } from '@/utils/redis/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username') || 'Malcolm';
    
    console.log(`[DEBUG] Checking pending matches for ${username}`);
    
    // Get all pending match keys
    const pendingKeys = await redis.keys('pending_match:*');
    console.log(`[DEBUG] Found ${pendingKeys.length} pending match keys:`, pendingKeys);
    
    const results = [];
    
    for (const key of pendingKeys) {
      const pendingData = await redis.get(key);
      console.log(`[DEBUG] Key ${key} data:`, pendingData);
      
      if (!pendingData) {
        results.push({ key, status: 'no_data' });
        continue;
      }
      
      try {
        const pendingMatch: PendingMatch = JSON.parse(pendingData);
        console.log(`[DEBUG] Parsed match:`, pendingMatch);
        
        // Check if this user is in this pending match
        if (pendingMatch.user1 === username || pendingMatch.user2 === username) {
          const matchedWith = pendingMatch.user1 === username ? pendingMatch.user2 : pendingMatch.user1;
          console.log(`[DEBUG] FOUND MATCH for ${username} with ${matchedWith}`);
          
          results.push({
            key,
            status: 'found',
            pendingMatch,
            matchedWith,
            roomName: pendingMatch.roomName
          });
        } else {
          results.push({
            key,
            status: 'not_for_user',
            pendingMatch
          });
        }
      } catch (e) {
        console.error(`[DEBUG] Error parsing pending match data for ${key}:`, e);
        results.push({ key, status: 'parse_error', error: String(e) });
      }
    }
    
    return NextResponse.json({
      username,
      pendingKeys,
      results,
      found: results.some(r => r.status === 'found')
    });
    
  } catch (error) {
    console.error('[DEBUG] Error in debug-pending:', error);
    return NextResponse.json(
      { error: 'Debug failed', details: String(error) },
      { status: 500 }
    );
  }
} 