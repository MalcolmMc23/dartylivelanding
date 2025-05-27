import { NextResponse } from 'next/server';
import { runConsistencyCheck } from '@/utils/redis/stateConsistencyManager';
import redis from '@/lib/redis';

const LAST_CHECK_RESULT_KEY = 'last_consistency_check_result';

export async function GET() {
  try {
    // Get the last consistency check result
    const lastResult = await redis.get(LAST_CHECK_RESULT_KEY);
    
    if (lastResult) {
      return NextResponse.json(JSON.parse(lastResult));
    } else {
      return NextResponse.json({
        timestamp: 0,
        checksPerformed: [],
        issues: [],
        fixes: [],
        stats: {
          usersInQueue: 0,
          activeMatches: 0,
          leftBehindStatesCleanedUp: 0,
          duplicateQueueEntriesRemoved: 0,
          orphanedMatchesRemoved: 0
        },
        message: 'No consistency check has been run yet'
      });
    }
  } catch (error) {
    console.error('Error fetching consistency check result:', error);
    return NextResponse.json(
      { error: 'Failed to fetch consistency check result' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Run a manual consistency check
    const result = await runConsistencyCheck();
    
    // Store the result for future GET requests
    await redis.set(
      LAST_CHECK_RESULT_KEY,
      JSON.stringify(result),
      'EX',
      3600 // Expire after 1 hour
    );
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error running consistency check:', error);
    return NextResponse.json(
      { error: 'Failed to run consistency check' },
      { status: 500 }
    );
  }
} 