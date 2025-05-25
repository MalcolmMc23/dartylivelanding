import { NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';
import redis from '@/lib/redis';
import { cleanupOrphanedInCallUsers } from '@/utils/redis/queueProcessor';
import { checkExistingMatch } from '@/utils/redis/matchingService';
import { PendingMatch } from '@/utils/redis/types';
import { checkMatchNotification, clearMatchNotification } from '@/utils/redis/matchNotificationService';

// Debug log with timestamps
function debugLog(message: string) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[CHECK-MATCH] ${message}`);
  }
}

// Helper function to check if user has any pending matches
async function checkUserPendingMatches(username: string): Promise<{
  found: boolean;
  pendingMatch?: PendingMatch;
  roomName?: string;
  matchedWith?: string;
  useDemo?: boolean;
}> {
  try {
    console.log(`[PENDING-CHECK] Checking pending matches for ${username}`);
    
    // Get all pending match keys
    const pendingKeys = await redis.keys('pending_match:*');
    console.log(`[PENDING-CHECK] Found ${pendingKeys.length} pending match keys:`, pendingKeys);
    
    for (const key of pendingKeys) {
      const pendingData = await redis.get(key);
      console.log(`[PENDING-CHECK] Key ${key} data:`, pendingData);
      
      if (!pendingData) continue;
      
      try {
        const pendingMatch: PendingMatch = JSON.parse(pendingData);
        console.log(`[PENDING-CHECK] Parsed match:`, pendingMatch);
        
        // Check if this user is in this pending match
        if (pendingMatch.user1 === username || pendingMatch.user2 === username) {
          const matchedWith = pendingMatch.user1 === username ? pendingMatch.user2 : pendingMatch.user1;
          
          console.log(`[PENDING-CHECK] FOUND MATCH for ${username} with ${matchedWith} in room ${pendingMatch.roomName}`);
          debugLog(`Found pending match for ${username} with ${matchedWith} in room ${pendingMatch.roomName}`);
          
          return {
            found: true,
            pendingMatch,
            roomName: pendingMatch.roomName,
            matchedWith,
            useDemo: pendingMatch.useDemo
          };
        } else {
          console.log(`[PENDING-CHECK] Match not for ${username} (user1: ${pendingMatch.user1}, user2: ${pendingMatch.user2})`);
        }
      } catch (e) {
        console.error('[PENDING-CHECK] Error parsing pending match data:', e);
      }
    }
    
    console.log(`[PENDING-CHECK] No pending match found for ${username}`);
    return { found: false };
  } catch (error) {
    console.error('[PENDING-CHECK] Error checking pending matches:', error);
    return { found: false };
  }
}

export async function POST(request: Request) {
  try {
    const { username } = await request.json();
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    debugLog(`Checking match status for user: ${username}`);

    // First, check for match notifications
    const notification = await checkMatchNotification(username);
    if (notification && notification.hasNotification) {
      debugLog(`User ${username} has a match notification for room ${notification.roomName}`);
      
      // Clear the notification after reading
      await clearMatchNotification(username);
      
      return NextResponse.json({ 
        match: true, 
        roomName: notification.roomName,
        matchedWith: notification.matchedWith,
        useDemo: notification.useDemo || false,
        routeType: 'room',
        debug: {
          matchedWith: notification.matchedWith,
          useDemo: notification.useDemo || false,
          matchType: "notification"
        }
      });
    }

    // First, run cleanup for orphaned in-call users
    try {
      const cleanupResult = await cleanupOrphanedInCallUsers();
      if (cleanupResult.cleanedUp > 0) {
        debugLog(`Cleaned up ${cleanupResult.cleanedUp} orphaned in-call users`);
      }
    } catch (cleanupError) {
      console.warn('Error during orphaned user cleanup:', cleanupError);
    }

    // Check if user has an existing match
    const existingMatch = await checkExistingMatch(username);
    
    if (existingMatch && existingMatch.status === 'matched') {
      const matched = existingMatch as typeof existingMatch & { matchedWith: string; roomName: string; useDemo?: boolean };
      debugLog(`User ${username} already has an active match with ${matched.matchedWith} in room ${matched.roomName}`);
      
      return NextResponse.json({ 
        match: true, 
        roomName: matched.roomName,
        matchedWith: matched.matchedWith,
        useDemo: matched.useDemo || false,
        routeType: 'room',
        debug: {
          matchedWith: matched.matchedWith,
          useDemo: matched.useDemo || false,
          matchType: "existing"
        }
      });
    }

    // NEW: Check for pending matches
    console.log(`[CHECK-MATCH] About to check pending matches for ${username}`);
    const pendingMatchCheck = await checkUserPendingMatches(username);
    console.log(`[CHECK-MATCH] Pending match check result:`, pendingMatchCheck);
    
    if (pendingMatchCheck.found) {
      console.log(`[CHECK-MATCH] User ${username} has a pending match with ${pendingMatchCheck.matchedWith} in room ${pendingMatchCheck.roomName}`);
      debugLog(`User ${username} has a pending match with ${pendingMatchCheck.matchedWith} in room ${pendingMatchCheck.roomName}`);
      
      return NextResponse.json({ 
        match: true, 
        roomName: pendingMatchCheck.roomName,
        matchedWith: pendingMatchCheck.matchedWith,
        useDemo: pendingMatchCheck.useDemo || false,
        routeType: 'room',
        debug: {
          matchedWith: pendingMatchCheck.matchedWith,
          useDemo: pendingMatchCheck.useDemo || false,
          matchType: "pending",
          pendingMatch: pendingMatchCheck.pendingMatch
        }
      });
    }
    
    console.log(`[CHECK-MATCH] No pending match found for ${username}, continuing to queue status check`);

    // Check user's current queue status
    const status = await hybridMatchingService.getWaitingQueueStatus(username);
    debugLog(`User ${username} queue status: ${JSON.stringify(status)}`);

    if (status.status === 'matched') {
      // User was just matched
      const matched = status as typeof status & { matchedWith: string; roomName: string; useDemo?: boolean };
      debugLog(`User ${username} was just matched with ${matched.matchedWith} in room ${matched.roomName}`);
      
      return NextResponse.json({ 
        match: true, 
        roomName: matched.roomName,
        matchedWith: matched.matchedWith,
        useDemo: matched.useDemo || false,
        routeType: 'room',
        debug: {
          matchedWith: matched.matchedWith,
          useDemo: matched.useDemo || false,
          matchType: "just_matched"
        }
      });
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
      // User is not in any queue - this might indicate a stuck state
      debugLog(`User ${username} is not in any queue, attempting to add them back`);
      
      // Try to add them back to the queue and immediately find a match
      const matchResult = await hybridMatchingService.findMatchForUser(username, false);
      
      if (matchResult.status === 'matched') {
        const matched = matchResult as typeof matchResult & { matchedWith: string; roomName: string; useDemo?: boolean };
        debugLog(`MATCH FOUND after re-adding to queue: ${username} matched with ${matched.matchedWith} in room ${matched.roomName}`);
        
        return NextResponse.json({ 
          match: true, 
          roomName: matched.roomName,
          matchedWith: matched.matchedWith,
          useDemo: matched.useDemo || false,
          routeType: 'room',
          debug: {
            matchedWith: matched.matchedWith,
            useDemo: matched.useDemo || false,
            matchType: "recovered"
          }
        });
      } else {
        // Still no match, user is now waiting
        return NextResponse.json({ 
          match: false,
          debug: {
            status: 'waiting',
            queuePosition: 0,
            queueLength: 0,
            waitTime: 0,
            recovered: true
          }
        });
      }
    } else {
      // Unknown status
      debugLog(`User ${username} has unknown status: ${status.status}`);
      
      return NextResponse.json({ 
        match: false,
        debug: {
          status: status.status,
          error: 'Unknown status'
        }
      });
    }

  } catch (error) {
    console.error('Error in check-match:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      debug: {
        error: String(error)
      }
    }, { status: 500 });
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
      }, {} as Record<string, unknown>)
    });
  } catch (error) {
    console.error("Error in check-match GET API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 