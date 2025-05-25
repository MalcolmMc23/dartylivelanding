import { NextRequest, NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { 
  MATCHING_QUEUE, 
  ACTIVE_MATCHES, 
  RECENT_MATCH_PREFIX,
  LEFT_BEHIND_PREFIX
} from '@/utils/redis/constants';

// Alone user tracking constant (defined in aloneUserManager.ts)
const ALONE_USER_TRACKING = 'alone_user_tracking';

// POST - Reset the matching system
export async function POST(request: NextRequest) {
  try {
    const { action = 'full' } = await request.json();
    
    let clearedItems = 0;
    const results: string[] = [];

    switch (action) {
      case 'cooldowns':
        // Clear all cooldowns
        const cooldownKeys = await redis.keys(`${RECENT_MATCH_PREFIX}*`);
        if (cooldownKeys.length > 0) {
          await redis.del(...cooldownKeys);
          clearedItems += cooldownKeys.length;
          results.push(`Cleared ${cooldownKeys.length} cooldowns`);
        }
        break;

      case 'queue':
        // Clear the matching queue
        await redis.del(MATCHING_QUEUE);
        results.push('Cleared matching queue');
        clearedItems++;
        break;

      case 'matches':
        // Clear active matches
        await redis.del(ACTIVE_MATCHES);
        results.push('Cleared active matches');
        clearedItems++;
        break;

      case 'left-behind':
        // Clear left-behind states
        const leftBehindKeys = await redis.keys(`${LEFT_BEHIND_PREFIX}*`);
        if (leftBehindKeys.length > 0) {
          await redis.del(...leftBehindKeys);
          clearedItems += leftBehindKeys.length;
          results.push(`Cleared ${leftBehindKeys.length} left-behind states`);
        }
        break;

      case 'alone-users':
        // Clear alone user tracking
        const aloneUserKeys = await redis.keys(`${ALONE_USER_TRACKING}*`);
        if (aloneUserKeys.length > 0) {
          await redis.del(...aloneUserKeys);
          clearedItems += aloneUserKeys.length;
          results.push(`Cleared ${aloneUserKeys.length} alone user states`);
        }
        break;

      case 'full':
      default:
        // Clear everything
        const allKeys = await Promise.all([
          redis.keys(`${RECENT_MATCH_PREFIX}*`),
          redis.keys(`${LEFT_BEHIND_PREFIX}*`),
          redis.keys(`${ALONE_USER_TRACKING}*`)
        ]);
        
        const keysToDelete = allKeys.flat();
        keysToDelete.push(MATCHING_QUEUE, ACTIVE_MATCHES);
        
        if (keysToDelete.length > 0) {
          await redis.del(...keysToDelete);
          clearedItems = keysToDelete.length;
        }
        
        results.push('Full system reset completed');
        break;
    }

    return NextResponse.json({
      success: true,
      action,
      clearedItems,
      results,
      message: `System reset (${action}) completed successfully`
    });

  } catch (error) {
    console.error('Error resetting system:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET - Get system status
export async function GET() {
  try {
    const [
      queueSize,
      activeMatchesCount,
      cooldownCount,
      leftBehindCount,
      aloneUserCount
    ] = await Promise.all([
      redis.hlen(MATCHING_QUEUE),
      redis.hlen(ACTIVE_MATCHES),
      redis.keys(`${RECENT_MATCH_PREFIX}*`).then(keys => keys.length),
      redis.keys(`${LEFT_BEHIND_PREFIX}*`).then(keys => keys.length),
      redis.keys(`${ALONE_USER_TRACKING}*`).then(keys => keys.length)
    ]);

    return NextResponse.json({
      status: 'healthy',
      stats: {
        queueSize,
        activeMatchesCount,
        cooldownCount,
        leftBehindCount,
        aloneUserCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting system status:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 