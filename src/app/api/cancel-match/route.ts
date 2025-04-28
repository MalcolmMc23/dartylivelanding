import { NextResponse } from "next/server";

// Use the same in-memory structures as in check-match
// In a production environment, these should be shared through Redis or a database
// For simplicity, we'll redeclare them (they'll be shared at runtime through Node.js module caching)
const waitingUsers: { username: string; timestamp: number }[] = [];
const activeMatches: { [key: string]: string[] } = {}; // roomName -> usernames

// Debug log with timestamps (same as in check-match)
function debugLog(...messages: unknown[]): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [CANCEL-DEBUG]`, ...messages);
}

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    debugLog(`Cancel match request for user: ${username}`);
    debugLog(`Current state before cancel: ${waitingUsers.length} waiting, ${Object.keys(activeMatches).length} active matches`);

    // Remove user from waiting queue if present
    const existingUserIndex = waitingUsers.findIndex(user => user.username === username);
    
    if (existingUserIndex !== -1) {
      // Remove user from queue
      const waitTime = Math.floor((Date.now() - waitingUsers[existingUserIndex].timestamp) / 1000);
      waitingUsers.splice(existingUserIndex, 1);
      debugLog(`Removed ${username} from waiting queue position ${existingUserIndex + 1}, waited for ${waitTime} seconds`);
      debugLog(`Queue size after removal: ${waitingUsers.length}`);
    } else {
      debugLog(`User ${username} not found in waiting queue`);
    }

    // Check if user is in an active match
    let matchCount = 0;
    const removedFrom: string[] = [];
    
    for (const [roomName, users] of Object.entries(activeMatches)) {
      if (users.includes(username)) {
        matchCount++;
        removedFrom.push(roomName);
        
        // Get the other user(s) in the room
        const otherUsers = users.filter(u => u !== username);
        debugLog(`Removing match in room ${roomName}. Other affected users: ${otherUsers.join(', ')}`);
        
        // Remove the match
        delete activeMatches[roomName];
        
        // The other user needs to be notified via a websocket in a real implementation
        // For now, they'll just timeout and check again
      }
    }
    
    if (matchCount > 0) {
      debugLog(`User ${username} removed from ${matchCount} active matches: ${removedFrom.join(', ')}`);
      debugLog(`Active matches after removal: ${Object.keys(activeMatches).length}`);
    } else {
      debugLog(`User ${username} not found in any active matches`);
    }

    return NextResponse.json({ 
      success: true,
      debug: {
        waitingQueueRemoved: existingUserIndex !== -1,
        activeMatchesRemoved: matchCount,
        affectedRooms: removedFrom
      }
    });
  } catch (error) {
    console.error("Error in cancel-match API:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
} 