import { NextResponse } from "next/server";

// Import the same in-memory structures used in other endpoints
// These will be shared at runtime through Node.js module caching
const waitingUsers: { username: string; timestamp: number }[] = [];
const activeMatches: { [key: string]: string[] } = {}; // roomName -> usernames

export async function GET() {
  // Return detailed information about matching system state
  return NextResponse.json({
    waitingUsers: waitingUsers.map(user => ({
      username: user.username,
      waitingFor: Math.floor((Date.now() - user.timestamp) / 1000) + " seconds",
      timestamp: new Date(user.timestamp).toISOString()
    })),
    waitingCount: waitingUsers.length,
    activeMatches: Object.entries(activeMatches).map(([roomName, users]) => ({
      roomName,
      users,
      userCount: users.length
    })),
    activeMatchCount: Object.keys(activeMatches).length,
    serverTime: new Date().toISOString(),
    memoryUsage: process.memoryUsage()
  });
} 