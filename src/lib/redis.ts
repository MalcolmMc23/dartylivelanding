import Redis from 'ioredis';

// Redis client initialization with production-ready configuration
let redis: Redis;

if (process.env.REDIS_URL) {
  // Production Redis configuration with retry logic and better error handling
  redis = new Redis(process.env.REDIS_URL, {
    connectTimeout: 10000, // 10 seconds
    commandTimeout: 5000,  // 5 seconds
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    // Production-ready retry strategy
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`Redis retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
    // Reconnect on error
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      return err.message.includes(targetError);
    }
  });
  
  console.log('Redis client created with production configuration');
  
  // Enhanced connection event handling
  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
    // Don't crash the app on Redis errors
  });
  
  redis.on('connect', async () => {
    console.log('Redis connected successfully');
    
    // Perform cleanup on startup with error handling
    try {
      await cleanupOnStartup();
      
      // Initialize production health monitoring
      await initializeProductionHealthCheck();
    } catch (e) {
      console.error('Error during Redis startup cleanup:', e);
      // Continue anyway - don't crash the app
    }
  });

  redis.on('ready', () => {
    console.log('Redis is ready to accept commands');
  });

  redis.on('reconnecting', () => {
    console.log('Redis is reconnecting...');
  });

  redis.on('close', () => {
    console.log('Redis connection closed');
  });

  // Connect immediately in production
  redis.connect().catch(err => {
    console.error('Failed to connect to Redis on startup:', err);
  });

} else {
  // Fallback for development or when Redis not available
  console.warn('REDIS_URL not defined, using fake Redis implementation');
  // @ts-expect-error - create a fake Redis client for development
  redis = createFakeRedis();
}

// Enhanced cleanup function with better error handling
async function cleanupOnStartup() {
  console.log('Running Redis cleanup on startup');
  
  try {
    // Force cleanup of old waiting users with more aggressive timeouts for production
    const waitingKey = 'matching:queue';
    const maxWaitTime = Date.now() - (3 * 60 * 1000); // Reduced to 3 minutes for production

    const removedUsers = await redis.zremrangebyscore(waitingKey, 0, maxWaitTime);
    
    // Clean up any lingering locks more aggressively
    await redis.del('match_lock');
    await redis.del('match_lock:time');
    
    // Clean up any stale active matches (older than 30 minutes)
    const activeMatches = await redis.hgetall('matching:active');
    let removedMatches = 0;
    
    for (const [roomName, matchDataStr] of Object.entries(activeMatches)) {
      try {
        const matchData = JSON.parse(matchDataStr);
        const age = Date.now() - (matchData.matchedAt || 0);
        
        if (age > 30 * 60 * 1000) { // 30 minutes
          await redis.hdel('matching:active', roomName);
          removedMatches++;
        }
      } catch {
        // Remove corrupted match data
        await redis.hdel('matching:active', roomName);
        removedMatches++;
      }
    }
    
    console.log(`Startup cleanup: removed ${removedUsers} stale users, ${removedMatches} stale matches, and cleared locks`);
    
    // Start LiveKit-Redis synchronization
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_LIVEKIT_SYNC === 'true') {
      try {
        const { startPeriodicSync } = await import('@/utils/livekit-sync/roomSyncService');
        startPeriodicSync(30000); // Sync every 30 seconds
        console.log('Started LiveKit-Redis periodic synchronization');
      } catch (syncError) {
        console.error('Error starting LiveKit-Redis sync:', syncError);
      }
    }
  } catch (error) {
    console.error('Error during startup cleanup:', error);
    // Don't throw - we want the app to continue even if cleanup fails
  }
}

// Initialize production health monitoring
async function initializeProductionHealthCheck() {
  try {
    // Import the health check module dynamically to avoid circular dependencies
    const { autoRepairProductionIssues } = await import('../utils/redis/productionHealthCheck');
    
    // Run initial auto-repair
    const repairs = await autoRepairProductionIssues();
    if (repairs.length > 0) {
      console.log('Production auto-repairs completed:', repairs);
    }
    
    // Set up periodic health checks (every 5 minutes)
    setInterval(async () => {
      try {
        const repairs = await autoRepairProductionIssues();
        if (repairs.length > 0) {
          console.log('Periodic auto-repairs completed:', repairs);
        }
      } catch (error) {
        console.error('Error during periodic health check:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('Production health monitoring initialized');
  } catch (error) {
    console.error('Failed to initialize production health monitoring:', error);
  }
}

// Enhanced fake Redis implementation for development
function createFakeRedis() {
  const data: Record<string, string> = {};
  const zsets: Record<string, Record<string, number>> = {};
  const hashes: Record<string, Record<string, string>> = {};
  const sets: Record<string, Set<string>> = {};
  
  console.log('Using memory-based fake Redis implementation');
  
  return {
    ping: async () => 'PONG',
    set: async (key: string, value: string) => {
      // Handle different SET variations (EX, NX, etc.)
      data[key] = value;
      return "OK";
    },
    get: async (key: string) => {
      return data[key] || null;
    },
    del: async (...keys: string[]) => {
      let count = 0;
      keys.forEach(key => {
        if (data[key] !== undefined) {
          delete data[key];
          count++;
        }
        if (zsets[key]) {
          delete zsets[key];
          count++;
        }
        if (hashes[key]) {
          delete hashes[key];
          count++;
        }
        if (sets[key]) {
          delete sets[key];
          count++;
        }
      });
      return count;
    },
    zadd: async (key: string, score: number, member: string) => {
      if (!zsets[key]) zsets[key] = {};
      const wasNew = zsets[key][member] === undefined;
      zsets[key][member] = score;
      return wasNew ? 1 : 0;
    },
    zrange: async (key: string, start: number, end: number, options?: string) => {
      if (!zsets[key]) return [];
      
      const entries = Object.entries(zsets[key]).sort((a, b) => a[1] - b[1]);
      const results = entries.slice(start, end === -1 ? undefined : end + 1).map(e => e[0]);
      
      if (options === 'WITHSCORES') {
        const withScores: string[] = [];
        for (const [member, score] of entries.slice(start, end === -1 ? undefined : end + 1)) {
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
      const wasNew = hashes[key][field] === undefined;
      hashes[key][field] = value;
      return wasNew ? 1 : 0;
    },
    hget: async (key: string, field: string) => {
      if (!hashes[key]) return null;
      return hashes[key][field] || null;
    },
    hdel: async (key: string, ...fields: string[]) => {
      if (!hashes[key]) return 0;
      let count = 0;
      fields.forEach(field => {
        if (hashes[key][field] !== undefined) {
          delete hashes[key][field];
          count++;
        }
      });
      return count;
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
    eval: async () => {
      // No-op for fake implementation
      return 1;
    },
    connect: async () => {
      // No-op for fake implementation
      return Promise.resolve();
    },
    on: () => {
      // No-op
      return;
    }
  };
}

export default redis; 