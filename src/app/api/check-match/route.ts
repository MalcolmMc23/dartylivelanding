import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// In-memory queue system for demonstration
// In a production environment, this should be moved to a database or Redis
const waitingUsers: { username: string; timestamp: number }[] = [];
const activeMatches: { [key: string]: string[] } = {}; // roomName -> usernames

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
    debugLog(`Current queue state: ${waitingUsers.length} waiting, ${Object.keys(activeMatches).length} active matches`);

    // Check if user is already in an active match
    for (const [roomName, users] of Object.entries(activeMatches)) {
      if (users.includes(username)) {
        debugLog(`User ${username} is already in active match: ${roomName}`);
        return NextResponse.json({ match: true, roomName });
      }
    }

    // Check if user is already in waiting queue, if not, add them
    const existingUserIndex = waitingUsers.findIndex(user => user.username === username);
    
    if (existingUserIndex === -1) {
      // User not in queue, add them
      waitingUsers.push({ username, timestamp: Date.now() });
      debugLog(`Added ${username} to waiting queue, position: ${waitingUsers.length}`);
    } else {
      // User already in queue, update timestamp to prevent multiple entries
      debugLog(`User ${username} already in queue at position ${existingUserIndex + 1}/${waitingUsers.length}`);
    }

    // If there's only one user in the queue (this user), no match yet
    if (waitingUsers.length === 1) {
      debugLog(`User ${username} is alone in queue, no match yet`);
      return NextResponse.json({ 
        match: false,
        debug: {
          queuePosition: 1,
          queueLength: waitingUsers.length,
          waitTime: Math.floor((Date.now() - waitingUsers[0].timestamp) / 1000)
        } 
      });
    }

    // Find the earliest waiting user that isn't this user
    let matchedUserIndex = -1;
    
    for (let i = 0; i < waitingUsers.length; i++) {
      if (waitingUsers[i].username !== username) {
        matchedUserIndex = i;
        break;
      }
    }

    // If we found a match
    if (matchedUserIndex !== -1) {
      const matchedUser = waitingUsers[matchedUserIndex];
      
      // Generate a room name
      const roomName = uuidv4();
      
      debugLog(`MATCH FOUND: ${username} matched with ${matchedUser.username} in room ${roomName}`);
      
      // Remove both users from waiting queue
      const usersToRemove = [username, matchedUser.username];
      const filteredUsers = waitingUsers.filter(user => !usersToRemove.includes(user.username));
      
      debugLog(`Removing users from queue: ${usersToRemove.join(', ')}`);
      debugLog(`Queue size before: ${waitingUsers.length}, after: ${filteredUsers.length}`);
      
      waitingUsers.length = 0;
      waitingUsers.push(...filteredUsers);
      
      // Add to active matches
      activeMatches[roomName] = [username, matchedUser.username];
      
      debugLog(`New active match created: ${roomName} with users ${activeMatches[roomName].join(', ')}`);
      debugLog(`Total active matches: ${Object.keys(activeMatches).length}`);
      
      return NextResponse.json({ 
        match: true, 
        roomName,
        debug: {
          matchedWith: matchedUser.username,
          waitTime: Math.floor((Date.now() - matchedUser.timestamp) / 1000)
        }
      });
    }

    // No match yet
    const userPosition = waitingUsers.findIndex(user => user.username === username) + 1;
    debugLog(`No match found for ${username}, still waiting at position ${userPosition}/${waitingUsers.length}`);
    
    return NextResponse.json({ 
      match: false,
      debug: {
        queuePosition: userPosition,
        queueLength: waitingUsers.length,
        waitTime: userPosition > 0 ? 
          Math.floor((Date.now() - waitingUsers[userPosition-1].timestamp) / 1000) : 0
      }
    });
  } catch (error) {
    console.error("Error in check-match API:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

// Helper function to get list of waiting users (for debugging)
export async function GET() {
  return NextResponse.json({ 
    waitingUsers: waitingUsers.length,
    activeMatches: Object.keys(activeMatches).length,
    users: waitingUsers.map(u => u.username),
    matches: Object.entries(activeMatches).map(([room, users]) => ({ room, users }))
  });
} 