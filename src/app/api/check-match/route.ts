import { NextResponse } from "next/server";
import * as hybridMatchingService from '@/utils/hybridMatchingService';
import redis from '@/lib/redis';
import { ROOM_PARTICIPANTS, ROOM_STATES } from '@/utils/redis/constants';
import { isSyncServiceRunning } from '@/utils/redis/syncService';
import { syncRoomAndQueueStates } from '@/utils/redis/roomStateManager';
import { isUserInValidMatch } from '@/utils/redis/matchValidator';

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
    
    // Clean up stale records and sync room states
    await hybridMatchingService.cleanupOldWaitingUsers();
    await hybridMatchingService.cleanupOldMatches();
    
    // Sync room and queue states to ensure consistency
    const syncResult = await syncRoomAndQueueStates();
    if (syncResult.usersAddedToQueue > 0 || syncResult.usersRemovedFromQueue > 0) {
      debugLog(`Sync result: ${syncResult.usersAddedToQueue} users added to queue, ${syncResult.usersRemovedFromQueue} users removed`);
    }
    
    // Check if user has a match using the Redis matching service
    const status = await hybridMatchingService.getWaitingQueueStatus(username);
    debugLog(`Current status for ${username}: ${JSON.stringify(status)}`);
    
    if (status.status === 'matched') {
      // User has been matched with someone!
      debugLog(`MATCH FOUND: ${username} matched with ${status.matchedWith} in room ${status.roomName}`);
      
      // First, validate that this is actually a valid match (both users in room)
      const validMatchResult = await isUserInValidMatch(username);
      
      if (!validMatchResult.isValid) {
        debugLog(`Match for ${username} is invalid - not both users in room, re-adding to queue`);
        // Match is invalid, re-add user to queue
        await hybridMatchingService.addUserToQueue(username, status.useDemo || false, false);
        return NextResponse.json({ 
          match: false,
          debug: {
            error: "Invalid match - not both users in room, re-added to queue",
            originalMatch: status,
            validationResult: validMatchResult
          }
        });
      }
      
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
        
        // Include additional navigation information to ensure proper routing
        return NextResponse.json({ 
          match: true, 
          roomName: status.roomName,
          matchedWith: status.matchedWith,
          useDemo: status.useDemo || false,
          routeType: 'room', // Add a route type to help the client
          debug: {
            matchedWith: status.matchedWith,
            useDemo: status.useDemo || false,
            roomInfo: roomInfo,
            validationResult: validMatchResult
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
    } else if (status.status === 'waiting' || status.status === 'in_call') {
      // User is still waiting for a match or in a call waiting for new match
      debugLog(`User ${username} is in ${status.status} queue`);
      
      // Try to find a match now (more aggressive matching)
      // We'll try multiple times with different settings to ensure we get the best possible match
      const matchResult = await hybridMatchingService.findMatchForUser(username, false);
      
      if (matchResult.status === 'matched') {
        const matched = matchResult as typeof matchResult & { matchedWith: string; roomName: string; useDemo?: boolean };
        debugLog(`MATCH FOUND on aggressive try: ${username} matched with ${matched.matchedWith} in room ${matched.roomName}`);
        
        return NextResponse.json({ 
          match: true, 
          roomName: matched.roomName,
          matchedWith: matched.matchedWith,
          useDemo: matched.useDemo || false,
          routeType: 'room', // Add a route type to help the client
          debug: {
            matchedWith: matched.matchedWith,
            useDemo: matched.useDemo || false,
            matchType: "aggressive"
          }
        });
      }
      
      return NextResponse.json({ 
        match: false,
        debug: {
          status: status.status,
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
          routeType: 'room', // Add a route type to help the client
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
    
    // Get room sync data
    const roomParticipantsData = await redis.hgetall(ROOM_PARTICIPANTS);
    const roomStatesData = await redis.hgetall(ROOM_STATES);

    return NextResponse.json({
      waitingQueueSize: waitingQueueData.length,
      inCallQueueSize: inCallQueueData.length,
      activeMatchesCount: Object.keys(activeMatchesData || {}).length,
      roomParticipantsCount: Object.keys(roomParticipantsData || {}).length,
      roomStatesCount: Object.keys(roomStatesData || {}).length,
      syncServiceRunning: isSyncServiceRunning(),
      waitingQueue: waitingQueueData.map(d => {
        try { return JSON.parse(d); } 
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        catch (_) { return d; }
      }),
      inCallQueue: inCallQueueData.map(d => {
        try { return JSON.parse(d); } 
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        catch (_) { return d; }
      }),
      activeMatches: Object.entries(activeMatchesData || {}).reduce((acc, [key, value]) => {
        try {
          acc[key] = JSON.parse(value as string);
        } 
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        catch (_) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, unknown>),
      roomParticipants: Object.entries(roomParticipantsData || {}).reduce((acc, [key, value]) => {
        try {
          acc[key] = JSON.parse(value as string);
        } 
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        catch (_) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, unknown>),
      roomStates: Object.entries(roomStatesData || {}).reduce((acc, [key, value]) => {
        try {
          acc[key] = JSON.parse(value as string);
        } 
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        catch (_) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, unknown>)
    });
  } catch (error) {
    console.error("Error in check-match GET API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 