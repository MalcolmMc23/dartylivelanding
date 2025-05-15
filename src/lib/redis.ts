import { Redis } from 'ioredis';

// Create a singleton Redis client
let redis: Redis;

// This prevents multiple instances from being created during development
// and avoids hydration errors due to different connection states
const getRedisClient = () => {
  // During server-side rendering, we need to create a new Redis client
  // Only create Redis in server environments
  if (typeof window === 'undefined') {
    if (!redis) {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true;
          }
          return false;
        },
        maxRetriesPerRequest: 3
      });

      // Test the connection
      redis.on('connect', () => {
        console.log('Connected to Redis');
      });

      redis.on('error', (err) => {
        console.error('Redis connection error:', err);
      });
    }

    return redis;
  }

  // In client environments, return a dummy Redis client that
  // always resolves with fallback values to prevent errors
  return createDummyRedisClient();
};

// Create a dummy Redis client for client-side rendering
function createDummyRedisClient() {
  // Create a mock object that implements the minimal Redis interface we need
  const dummyClient = {
    zadd: async () => 0,
    zrange: async () => [] as string[],
    zrem: async () => 0,
    hset: async () => 0,
    hget: async () => null,
    hdel: async () => 0,
    hgetall: async () => ({} as Record<string, string>),
    zremrangebyscore: async () => 0,
    on: () => {
      // Return the client to allow chaining
      return dummyClient;
    }
  } as unknown as Redis;
  
  return dummyClient;
}

// Create a wrapper function to safely execute Redis commands
export async function safeRedisOperation<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error('Redis operation failed:', error);
    return fallback;
  }
}

// Export the Redis client singleton
export default getRedisClient(); 