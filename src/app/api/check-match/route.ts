import { NextResponse } from "next/server";
import * as hybridMatchingService from '@/utils/hybridMatchingService';
import redis from '@/lib/redis';

// Debug log with timestamps
function debugLog(...messages: unknown[]): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [MATCH-DEBUG]`, ...messages);
}

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    debugLog(`Check match request for user: ${username}`);
    
    // Clean up stale records
    await hybridMatchingService.cleanupOldWaitingUsers();
    await hybridMatchingService.cleanupOldMatches();
    
    // Check if user has a match using the Redis matching service
    const status = await hybridMatchingService.getWaitingQueueStatus(username);
    debugLog(`Current status for ${username}: ${JSON.stringify(status)}`);
    
    if (status.status === 'matched') {
      // User has been matched with someone!
      debugLog(`MATCH FOUND: ${username} matched with ${status.matchedWith} in room ${status.roomName}`);
      
      // Verify that room exists in Redis before sending back to client
      if (status.roomName) {
        const roomInfo = await hybridMatchingService.getRoomInfo(status.roomName);
        if (!roomInfo.isActive) {
          debugLog(`Room ${status.roomName} is not active, fixing match record...`);
          // Attempt to create/fix the match
          await hybridMatchingService.addUserToQueue(username, status.useDemo || false, false);
          return NextResponse.json({ 
            match: false,
            debug: {
              error: "Room not active, re-added to queue",
              originalMatch: status
            }
          });
        }
        
        return NextResponse.json({ 
          match: true, 
          roomName: status.roomName,
          matchedWith: status.matchedWith,
          useDemo: status.useDemo || false,
          debug: {
            matchedWith: status.matchedWith,
            useDemo: status.useDemo || false,
            roomInfo: roomInfo
          }
        });
      } else {
        debugLog(`Matched status but missing roomName, fixing...`);
        // Re-add to queue if room name is missing
        await hybridMatchingService.addUserToQueue(username, status.useDemo || false, false);
        return NextResponse.json({ 
          match: false,
          debug: {
            error: "Missing room name, re-added to queue",
            originalMatch: status
          }
        });
      }
    } else if (status.status === 'waiting') {
      // User is still waiting for a match
      debugLog(`User ${username} is in waiting queue`);
      
      // Try to find a match now (more aggressive matching)
      const matchResult = await hybridMatchingService.findMatchForUser(username, false);
      
      if (matchResult.status === 'matched') {
        debugLog(`MATCH FOUND on aggressive try: ${username} matched with ${matchResult.matchedWith} in room ${matchResult.roomName}`);
        
        return NextResponse.json({ 
          match: true, 
          roomName: matchResult.roomName,
          matchedWith: matchResult.matchedWith,
          useDemo: matchResult.useDemo || false,
          debug: {
            matchedWith: matchResult.matchedWith,
            useDemo: matchResult.useDemo || false,
            matchType: "aggressive"
          }
        });
      }
      
      return NextResponse.json({ 
        match: false,
        debug: {
          queuePosition: status.position || 0,
          queueLength: status.queueSize || 0,
          waitTime: 0
        }
      });
    } else if (status.status === 'not_waiting') {
      // User is not in the waiting queue, re-add them
      debugLog(`User ${username} is not in queue, adding back to queue`);
      
      // Re-add user to waiting queue with useDemo=false (default)
      await hybridMatchingService.addUserToQueue(username, false);
      
      // Immediately try to find a match (more eager matching)
      const immediateMatchResult = await hybridMatchingService.findMatchForUser(username, false);
      
      if (immediateMatchResult.status === 'matched') {
        debugLog(`IMMEDIATE MATCH FOUND: ${username} matched with ${immediateMatchResult.matchedWith} in room ${immediateMatchResult.roomName}`);
        
        return NextResponse.json({ 
          match: true, 
          roomName: immediateMatchResult.roomName,
          matchedWith: immediateMatchResult.matchedWith,
          useDemo: immediateMatchResult.useDemo || false,
          debug: {
            matchedWith: immediateMatchResult.matchedWith,
            useDemo: immediateMatchResult.useDemo || false,
            matchType: "immediate"
          }
        });
      }
      
      return NextResponse.json({ 
        match: false,
        debug: {
          queuePosition: 1,
          queueLength: 1,
          waitTime: 0
        }
      });
    }
    
    // Default response - no match yet
    return NextResponse.json({ match: false });
  } catch (error) {
    console.error("Error in check-match API:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

// Helper function to get list of waiting users (for debugging)
export async function GET() {
  try {
    // Clean up stale records
    await hybridMatchingService.cleanupOldWaitingUsers();
    await hybridMatchingService.cleanupOldMatches();
    
    // For debugging, return the raw Redis queue data
    const waitingQueueData = await redis.zrange('matching:waiting', 0, -1);
    const inCallQueueData = await redis.zrange('matching:in_call', 0, -1);
    const activeMatchesData = await redis.hgetall('matching:active');

    return NextResponse.json({
      waitingQueueSize: waitingQueueData.length,
      inCallQueueSize: inCallQueueData.length,
      activeMatchesCount: Object.keys(activeMatchesData || {}).length,
      waitingQueue: waitingQueueData.map(d => {
        try { return JSON.parse(d); } catch (e) { return d; }
      }),
      inCallQueue: inCallQueueData.map(d => {
        try { return JSON.parse(d); } catch (e) { return d; }
      }),
      activeMatches: Object.entries(activeMatchesData || {}).reduce((acc, [key, value]) => {
        try {
          acc[key] = JSON.parse(value as string);
        } catch (e) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>)
    });
  } catch (error) {
    console.error("Error in check-match GET API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 