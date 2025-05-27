import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { LEFT_BEHIND_PREFIX } from '@/utils/redis/constants';

export async function GET() {
  try {
    // Get all left-behind states
    const pattern = `${LEFT_BEHIND_PREFIX}*`;
    const keys = await redis.keys(pattern);
    
    const states = [];
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        try {
          const state = JSON.parse(data);
          states.push(state);
        } catch (e) {
          console.error('Error parsing left-behind state:', e);
        }
      }
    }
    
    // Sort by timestamp, most recent first
    states.sort((a, b) => b.timestamp - a.timestamp);
    
    return NextResponse.json({
      states,
      count: states.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error fetching left-behind states:', error);
    return NextResponse.json(
      { error: 'Failed to fetch left-behind states' },
      { status: 500 }
    );
  }
} 