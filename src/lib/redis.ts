import Redis from 'ioredis';

// Redis client initialization
let redis: Redis;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
  console.log('Connected to Redis');
  
  // Handle connection events
  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });
  
  redis.on('connect', async () => {
    console.log('Redis connected successfully');
    
    // Perform cleanup on startup
    try {
      // Clean up any stale data on startup
      await cleanupOnStartup();
    } catch (e) {
      console.error('Error during Redis startup cleanup:', e);
    }
  });
} else {
  // Fallback for development or when Redis not available
  console.warn('REDIS_URL not defined, using fake Redis implementation');
  // @ts-expect-error - create a fake Redis client for development
  redis = createFakeRedis();
}

// Clean up stale data when the server starts
async function cleanupOnStartup() {
  console.log('Running Redis cleanup on startup');
  
  try {
    // Force cleanup of old waiting users
    // Remove users who joined more than 5 minutes ago from waiting queue
    const waitingKey = 'matching:waiting';
    const inCallKey = 'matching:in_call';
    const maxWaitTime = Date.now() - (5 * 60 * 1000);
    
    const removedWaiting = await redis.zremrangebyscore(waitingKey, 0, maxWaitTime);
    const removedInCall = await redis.zremrangebyscore(inCallKey, 0, maxWaitTime);
    
    // Clean up any lingering locks
    await redis.del('match_lock');
    await redis.del('match_lock:time');
    
    console.log(`Startup cleanup: removed ${removedWaiting} stale waiting users, ${removedInCall} stale in-call users, and cleared locks`);
  } catch (error) {
    console.error('Error during startup cleanup:', error);
  }
}

// Helper function to create a fake Redis client for development
function createFakeRedis() {
  const data: Record<string, string> = {};
  const zsets: Record<string, Record<string, number>> = {};
  const hashes: Record<string, Record<string, string>> = {};
  const sets: Record<string, Set<string>> = {};
  
  console.log('Using memory-based fake Redis implementation');
  
  return {
    set: async (key: string, value: string) => {
      // Handle different SET variations (EX, NX, etc.)
      data[key] = value;
      return "OK";
    },
    get: async (key: string) => {
      return data[key] || null;
    },
    del: async (key: string) => {
      delete data[key];
      delete zsets[key];
      delete hashes[key];
      delete sets[key];
      return 1;
    },
    zadd: async (key: string, score: number, member: string) => {
      if (!zsets[key]) zsets[key] = {};
      zsets[key][member] = score;
      return 1;
    },
    zrange: async (key: string, start: number, end: number, options?: string) => {
      if (!zsets[key]) return [];
      
      const entries = Object.entries(zsets[key]).sort((a, b) => a[1] - b[1]);
      const results = entries.slice(start, end === -1 ? undefined : end + 1).map(e => e[0]);
      
      if (options === 'WITHSCORES') {
        const withScores: string[] = [];
        for (const [member, score] of entries) {
          withScores.push(member);
          withScores.push(score.toString());
        }
        return withScores;
      }
      
      return results;
    },
    zrem: async (key: string, member: string) => {
      if (!zsets[key]) return 0;
      if (zsets[key][member] !== undefined) {
        delete zsets[key][member];
        return 1;
      }
      return 0;
    },
    zremrangebyscore: async (key: string, min: number, max: number) => {
      if (!zsets[key]) return 0;
      let count = 0;
      
      Object.entries(zsets[key]).forEach(([member, score]) => {
        if (score >= min && score <= max) {
          delete zsets[key][member];
          count++;
        }
      });
      
      return count;
    },
    hset: async (key: string, field: string, value: string) => {
      if (!hashes[key]) hashes[key] = {};
      hashes[key][field] = value;
      return 1;
    },
    hget: async (key: string, field: string) => {
      if (!hashes[key]) return null;
      return hashes[key][field] || null;
    },
    hdel: async (key: string, field: string) => {
      if (!hashes[key]) return 0;
      if (hashes[key][field] !== undefined) {
        delete hashes[key][field];
        return 1;
      }
      return 0;
    },
    hgetall: async (key: string) => {
      return hashes[key] || {};
    },
    sadd: async (key: string, member: string) => {
      if (!sets[key]) sets[key] = new Set();
      const hadMember = sets[key].has(member);
      sets[key].add(member);
      return hadMember ? 0 : 1;
    },
    sismember: async (key: string, member: string) => {
      if (!sets[key]) return 0;
      return sets[key].has(member) ? 1 : 0;
    },
    expire: async () => {
      // No-op for fake implementation
      return 1;
    },
    on: () => {
      // No-op
      return;
    }
  };
}

export default redis; 