import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { MATCHING_QUEUE, ACTIVE_MATCHES } from '@/utils/redis/constants';
import { UserDataInQueue, UserQueueState } from '@/utils/redis/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Get all users in the queue
    const allQueuedUsersRaw = await redis.zrange(MATCHING_QUEUE, 0, -1);
    
    let userPosition: number | null = null;
    let userState: UserQueueState | null = null;
    let userJoinedAt: number | null = null;

    // Parse queue data and find user position
    const waitingUsers: UserDataInQueue[] = [];
    const inCallUsers: UserDataInQueue[] = [];

    for (const userData of allQueuedUsersRaw) {
      try {
        const user: UserDataInQueue = JSON.parse(userData);
        
        if (user.state === 'waiting') {
          waitingUsers.push(user);
        } else if (user.state === 'in_call') {
          inCallUsers.push(user);
        }

        // Check if this is our user
        if (user.username === username) {
          userState = user.state;
          userJoinedAt = user.joinedAt;
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }

    // Calculate position based on user state
    if (userState === 'waiting') {
      // Sort waiting users by join time (FIFO)
      waitingUsers.sort((a, b) => a.joinedAt - b.joinedAt);
      userPosition = waitingUsers.findIndex(u => u.username === username) + 1;
    } else if (userState === 'in_call') {
      // In-call users have higher priority, so they're ahead of waiting users
      inCallUsers.sort((a, b) => a.joinedAt - b.joinedAt);
      userPosition = inCallUsers.findIndex(u => u.username === username) + 1;
    }

    // Calculate estimated wait time
    let estimatedWait = "Calculating...";
    if (userPosition && userJoinedAt) {
      const waitTimeMs = Date.now() - userJoinedAt;
      const waitTimeMinutes = Math.floor(waitTimeMs / 60000);
      const waitTimeSeconds = Math.floor((waitTimeMs % 60000) / 1000);

      if (waitTimeMinutes > 0) {
        estimatedWait = `${waitTimeMinutes}m ${waitTimeSeconds}s`;
      } else {
        estimatedWait = `${waitTimeSeconds}s`;
      }

      // Add estimated remaining time based on position
      if (userState === 'waiting' && userPosition > 1) {
        const estimatedRemainingMinutes = Math.max(0, (userPosition - 1) * 0.5); // Estimate 30 seconds per person ahead
        if (estimatedRemainingMinutes > 0) {
          estimatedWait += ` (est. ${Math.ceil(estimatedRemainingMinutes)}m remaining)`;
        } else {
          estimatedWait += " (matching soon!)";
        }
      } else if (userState === 'in_call') {
        estimatedWait += " (priority matching)";
      }
    }

    // Get active matches count for additional stats
    const activeMatchesCount = await redis.hlen(ACTIVE_MATCHES);

    return NextResponse.json({
      position: userPosition,
      estimatedWait,
      queueStats: {
        totalWaiting: waitingUsers.length,
        totalInCall: inCallUsers.length,
        activeMatches: activeMatchesCount,
        yourState: userState as string | null
      },
      timestamp: Date.now()
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
} 