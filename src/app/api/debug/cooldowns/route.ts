import { NextRequest, NextResponse } from 'next/server';
import { recordCooldown, clearCooldown, getCooldownRemaining } from '@/utils/redis/rematchCooldown';
import redis from '@/lib/redis';
import { RECENT_MATCH_PREFIX } from '@/utils/redis/constants';

// GET - Get cooldown information for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Get all cooldown keys
    const pattern = `${RECENT_MATCH_PREFIX}*`;
    const keys = await redis.keys(pattern);
    
    const cooldowns = [];
    
    for (const key of keys) {
      const userPair = key.replace(RECENT_MATCH_PREFIX, '').split(':');
      if (userPair.length === 2 && userPair.includes(username)) {
        const [user1, user2] = userPair;
        const remaining = await getCooldownRemaining(user1, user2);
        
        if (remaining > 0) {
          // Determine type based on remaining time
          const type = remaining > 20 ? 'skip' : 'normal';
          
          cooldowns.push({
            user1,
            user2,
            remaining,
            type
          });
        }
      }
    }

    return NextResponse.json({ cooldowns });
  } catch (error) {
    console.error('Error getting cooldowns:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Set a cooldown between two users
export async function POST(request: NextRequest) {
  try {
    const { user1, user2, type = 'normal' } = await request.json();

    if (!user1 || !user2) {
      return NextResponse.json({ error: 'Both users required' }, { status: 400 });
    }

    if (type !== 'normal' && type !== 'skip') {
      return NextResponse.json({ error: 'Type must be normal or skip' }, { status: 400 });
    }

    await recordCooldown(user1, user2, type);

    return NextResponse.json({ 
      success: true, 
      message: `Set ${type} cooldown between ${user1} and ${user2}` 
    });
  } catch (error) {
    console.error('Error setting cooldown:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Clear cooldown between two users
export async function DELETE(request: NextRequest) {
  try {
    const { user1, user2 } = await request.json();

    if (!user1 || !user2) {
      return NextResponse.json({ error: 'Both users required' }, { status: 400 });
    }

    await clearCooldown(user1, user2);

    return NextResponse.json({ 
      success: true, 
      message: `Cleared cooldown between ${user1} and ${user2}` 
    });
  } catch (error) {
    console.error('Error clearing cooldown:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 