import { NextResponse } from "next/server";
import redis from '@/lib/redis';

export async function POST(request: Request) {
  try {
    // Check for authentication key
    // In a real app, you should use proper authentication
    const body = await request.json();
    const { apiKey } = body;
    
    // Basic authentication check - replace with your own secure method
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Delete all matching-related keys
    await redis.del('matching:waiting');
    await redis.del('matching:in_call');
    await redis.del('matching:active');
    await redis.del('match_lock');
    await redis.del('match_lock:time');
    
    // You might want to preserve used room names to prevent collisions
    
    console.log('Reset all matching data in Redis');
    
    return NextResponse.json({ success: true, message: "All matching data has been reset" });
  } catch (error) {
    console.error('Error resetting matching data:', error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

// Allow checking the reset status
export async function GET() {
  try {
    // Get counts of current data
    const waitingCount = await redis.zcard('matching:waiting');
    const inCallCount = await redis.zcard('matching:in_call');
    const activeMatchesData = await redis.hgetall('matching:active');
    const activeMatchesCount = Object.keys(activeMatchesData || {}).length;
    
    return NextResponse.json({
      status: "ok",
      counts: {
        waiting: waitingCount,
        inCall: inCallCount,
        activeMatches: activeMatchesCount
      }
    });
  } catch (error) {
    console.error('Error checking reset status:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 