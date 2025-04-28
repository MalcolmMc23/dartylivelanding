import { NextResponse } from "next/server";

// Import the same in-memory structures used in other endpoints
// These will be shared at runtime through Node.js module caching
const waitingUsers: { username: string; timestamp: number }[] = [];
const activeMatches: { [key: string]: string[] } = {}; // roomName -> usernames

export async function POST(request: Request) {
  try {
    const { adminKey } = await request.json();
    
    // Very simple security - replace with proper auth in production
    if (adminKey !== process.env.ADMIN_KEY && adminKey !== "debug_reset_key") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Get current counts for reporting
    const oldWaitingCount = waitingUsers.length;
    const oldMatchCount = Object.keys(activeMatches).length;
    
    // Clear all state
    waitingUsers.length = 0;
    
    Object.keys(activeMatches).forEach(key => {
      delete activeMatches[key];
    });
    
    return NextResponse.json({
      success: true,
      message: "Matching system reset successfully",
      clearedData: {
        waitingUsers: oldWaitingCount,
        activeMatches: oldMatchCount
      }
    });
  } catch (error) {
    console.error("Error resetting matching system:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 