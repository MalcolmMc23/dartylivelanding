import redis from '../../lib/redis';

const USER_SKIP_STATS_PREFIX = 'userSkipStats:';

export interface UserSkipStats {
  totalInteractionTimeWithSkips: number;
  totalSkipsInvolved: number;
  averageSkipTime: number;
}

export async function updateUserSkipStats(username: string, callDurationMs: number): Promise<void> {
  if (!username) {
    console.error('Username is undefined, cannot update skip stats.');
    return;
  }
  if (callDurationMs < 0) {
    console.warn(`Call duration for ${username} is negative (${callDurationMs}ms), not updating stats.`);
    return;
  }

  const userStatsKey = `${USER_SKIP_STATS_PREFIX}${username}`;

  try {
    let stats: UserSkipStats | null = null;
    const existingStatsJson = await redis.get(userStatsKey);

    if (existingStatsJson) {
      stats = JSON.parse(existingStatsJson as string) as UserSkipStats;
    } else {
      stats = {
        totalInteractionTimeWithSkips: 0,
        totalSkipsInvolved: 0,
        averageSkipTime: 0,
      };
    }

    stats.totalInteractionTimeWithSkips += callDurationMs;
    stats.totalSkipsInvolved += 1;

    if (stats.totalSkipsInvolved > 0) {
      stats.averageSkipTime = Math.round(stats.totalInteractionTimeWithSkips / stats.totalSkipsInvolved);
    } else {
      stats.averageSkipTime = 0; 
    }

    await redis.set(userStatsKey, JSON.stringify(stats));
    console.log(`Updated skip stats for ${username}: avgSkipTime=${stats.averageSkipTime}ms, totalSkips=${stats.totalSkipsInvolved}`);

  } catch (error) {
    console.error(`Error updating skip stats for ${username}:`, error);
  }
}

export async function getUserSkipStats(username: string): Promise<UserSkipStats | null> {
  if (!username) {
    return null;
  }
  const userStatsKey = `${USER_SKIP_STATS_PREFIX}${username}`;
  const statsJson = await redis.get(userStatsKey);
  if (statsJson) {
    try {
      return JSON.parse(statsJson as string) as UserSkipStats;
    } catch (e) {
      console.error(`Error parsing skip stats for ${username}:`, e);
      return null;
    }
  }
  return null;
} 