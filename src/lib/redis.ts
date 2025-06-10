import Redis, { RedisOptions } from 'ioredis';
import { validateRedisConfig } from './validateEnv';

// Types for better type safety
export interface ConnectionHealth {
  isConnected: boolean;
  lastHeartbeat?: number;
  connectionAttempts: number;
  lastError?: string;
  uptime?: number;
}

export interface RedisConnectionConfig {
  url?: string;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
  maxRetriesOnConsecutiveFailures?: number;
  lazyConnect?: boolean;
  connectTimeout?: number;
  commandTimeout?: number;
}

/**
 * Redis Connection Manager with robust error handling, connection pooling,
 * and reconnection logic using exponential backoff
 */
interface FakeRedisClient {
  set: (key: string, value: string, ...args: (string | number)[]) => Promise<string | null>;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<number>;
  zadd: (key: string, score: number, member: string) => Promise<number>;
  zrange: (key: string, start: number, end: number, options?: string) => Promise<string[]>;
  zrangebyscore: (key: string, min: number, max: number) => Promise<string[]>;
  zrevrange: (key: string, start: number, end: number, options?: string) => Promise<string[]>;
  zrem: (key: string, ...members: string[]) => Promise<number>;
  zremrangebyscore: (key: string, min: number, max: number) => Promise<number>;
  zcard: (key: string) => Promise<number>;
  zscore: (key: string, member: string) => Promise<string | null>;
  hset: (key: string, field: string, value: string) => Promise<number>;
  hget: (key: string, field: string) => Promise<string | null>;
  hdel: (key: string, field: string) => Promise<number>;
  hgetall: (key: string) => Promise<Record<string, string>>;
  sadd: (key: string, member: string) => Promise<number>;
  sismember: (key: string, member: string) => Promise<number>;
  smembers: (key: string) => Promise<string[]>;
  mget: (...keys: string[]) => Promise<(string | null)[]>;
  expire: (key: string, ttl: number) => Promise<number>;
  setex: (key: string, ttl: number, value: string) => Promise<string>;
  keys: (pattern: string) => Promise<string[]>;
  ping: () => Promise<string>;
  connect: () => Promise<string>;
  on: () => void;
}

class RedisConnectionManager {
  private static instance: RedisConnectionManager;
  private redis: Redis | null = null;
  private fakeRedis: FakeRedisClient | null = null;
  private connectionAttempts = 0;
  private isConnected = false;
  private lastHeartbeat?: number;
  private connectionStartTime?: number;
  private lastError?: string;
  private maxRetries = 10;
  private baseDelay = 1000; // 1 second base delay
  private maxDelay = 30000; // 30 seconds max delay
  private useRedis: boolean;

  private constructor() {
    this.useRedis = !!process.env.REDIS_URL;
    
    // Validate configuration before initializing
    if (this.useRedis) {
      validateRedisConfig();
    }
    
    this.initializeConnection();
  }

  /**
   * Singleton pattern implementation
   */
  public static getInstance(): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      RedisConnectionManager.instance = new RedisConnectionManager();
    }
    return RedisConnectionManager.instance;
  }

  /**
   * Get the Redis client instance
   */
  public getClient(): Redis | FakeRedisClient {
    if (this.useRedis && this.redis) {
      return this.redis;
    }
    
    if (!this.useRedis && this.fakeRedis) {
      return this.fakeRedis;
    }

    throw new Error('Redis client not initialized');
  }

  /**
   * Initialize Redis connection with enhanced configuration
   */
  private initializeConnection(): void {
    if (this.useRedis) {
      this.initializeRealRedis();
    } else {
      this.initializeFakeRedis();
    }
  }

  /**
   * Initialize real Redis connection with robust options
   */
  private initializeRealRedis(): void {
    // Get configuration from environment with sensible defaults
    const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES || '10', 10);
    const connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10);
    const commandTimeout = parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10);
    
    this.maxRetries = maxRetries;
    
    const redisConfig: RedisOptions = {
      // Connection pooling and reliability options
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout,
      commandTimeout,
      
      // Retry strategy with exponential backoff
      retryStrategy: (times: number) => {
        if (times > this.maxRetries) {
          console.error(`Redis: Max retries (${this.maxRetries}) exceeded`);
          return null; // Stop retrying
        }

        const delay = Math.min(this.baseDelay * Math.pow(2, times - 1), this.maxDelay);
        console.log(`Redis: Retry attempt ${times} in ${delay}ms`);
        return delay;
      },

      // Additional resilience options
      keepAlive: 30000, // 30 seconds
      family: 4, // Use IPv4
    };

    this.redis = new Redis(process.env.REDIS_URL!, redisConfig);
    this.setupEventHandlers();
    this.connectionStartTime = Date.now();
    
    // Attempt initial connection
    this.attemptConnection();
  }

  /**
   * Setup event handlers for Redis connection monitoring
   */
  private setupEventHandlers(): void {
    if (!this.redis) return;

    this.redis.on('connect', () => {
      console.log('Redis: Connected successfully');
      this.isConnected = true;
      this.connectionAttempts = 0;
      this.lastError = undefined;
      this.updateHeartbeat();
      
      // Perform cleanup on successful connection
      this.performStartupCleanup().catch(console.error);
    });

    this.redis.on('ready', () => {
      console.log('Redis: Ready to accept commands');
      this.updateHeartbeat();
    });

    this.redis.on('error', (error) => {
      console.error('Redis: Connection error:', error.message);
      this.isConnected = false;
      this.lastError = error.message;
      this.connectionAttempts++;
    });

    this.redis.on('close', () => {
      console.log('Redis: Connection closed');
      this.isConnected = false;
    });

    this.redis.on('reconnecting', (ms: number) => {
      console.log(`Redis: Reconnecting in ${ms}ms`);
    });

    this.redis.on('end', () => {
      console.log('Redis: Connection ended');
      this.isConnected = false;
    });
  }

  /**
   * Attempt initial connection with error handling
   */
  private async attemptConnection(): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.connect();
      console.log('Redis: Initial connection successful');
    } catch (error) {
      console.error('Redis: Initial connection failed:', error);
      // Connection will be retried automatically via retry strategy
    }
  }

  /**
   * Update heartbeat timestamp for health monitoring
   */
  private updateHeartbeat(): void {
    this.lastHeartbeat = Date.now();
  }

  /**
   * Get current connection health status
   */
  public getHealth(): ConnectionHealth {
    const uptime = this.connectionStartTime 
      ? Date.now() - this.connectionStartTime 
      : undefined;

    return {
      isConnected: this.isConnected,
      lastHeartbeat: this.lastHeartbeat,
      connectionAttempts: this.connectionAttempts,
      lastError: this.lastError,
      uptime
    };
  }

  /**
   * Perform a health check by sending a ping
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      const result = await client.ping();
      const isHealthy = result === 'PONG';
      
      if (isHealthy) {
        this.updateHeartbeat();
      }
      
      return isHealthy;
    } catch (error) {
      console.error('Redis: Health check failed:', error);
      return false;
    }
  }

  /**
   * Clean up stale data on startup/reconnection
   */
  private async performStartupCleanup(): Promise<void> {
    console.log('Redis: Running startup cleanup');
    
    try {
      const client = this.getClient();
      
      // Force cleanup of old waiting users (5 minutes)
      const waitingKey = 'matching:waiting';
      const inCallKey = 'matching:in_call';
      const maxWaitTime = Date.now() - (5 * 60 * 1000);
      
      const removedWaiting = await client.zremrangebyscore(waitingKey, 0, maxWaitTime);
      const removedInCall = await client.zremrangebyscore(inCallKey, 0, maxWaitTime);
      
      // Clean up any lingering locks
      await client.del('match_lock');
      await client.del('match_lock:time');
      
      console.log(`Redis: Startup cleanup completed - removed ${removedWaiting} stale waiting users, ${removedInCall} stale in-call users, and cleared locks`);
    } catch (error) {
      console.error('Redis: Startup cleanup failed:', error);
    }
  }

  /**
   * Initialize fake Redis for development/testing
   */
  private initializeFakeRedis(): void {
    console.log('Redis: Using memory-based fake implementation for development');
    this.fakeRedis = this.createFakeRedis();
    this.isConnected = true;
    this.connectionStartTime = Date.now();
    this.updateHeartbeat();
  }

  /**
   * Create fake Redis implementation for development
   */
  private createFakeRedis(): FakeRedisClient {
    const data: Record<string, string> = {};
    const zsets: Record<string, Record<string, number>> = {};
    const hashes: Record<string, Record<string, string>> = {};
    const sets: Record<string, Set<string>> = {};
    
    return {
      set: async (key: string, value: string, ...args: (string | number)[]) => {
        let nx = false;
        let ex = -1;

        for (let i = 0; i < args.length; i++) {
          const arg = args[i].toString().toUpperCase();
          if (arg === 'NX') {
            nx = true;
          } else if (arg === 'EX' && args[i + 1]) {
            ex = Number(args[i + 1]);
            i++;
          }
        }

        if (nx && data[key] !== undefined) {
          return null; // Don't set if key exists for NX option
        }

        data[key] = value;
        
        if (ex > 0) {
          // Fake timeout for EX option
          setTimeout(() => {
            if (data[key] === value) {
              delete data[key];
            }
          }, ex * 1000);
        }

        return 'OK';
      },
      get: async (key: string) => {
        return data[key] || null;
      },
      del: async (key: string) => {
        let count = 0;
        if (data[key] !== undefined) { delete data[key]; count++; }
        if (zsets[key] !== undefined) { delete zsets[key]; count++; }
        if (hashes[key] !== undefined) { delete hashes[key]; count++; }
        if (sets[key] !== undefined) { delete sets[key]; count++; }
        return count;
      },
      zadd: async (key: string, score: number, member: string) => {
        if (!zsets[key]) zsets[key] = {};
        zsets[key][member] = score;
        return 1;
      },
      zrange: async (key: string, start: number, end: number) => {
        if (!zsets[key]) return [];
        const sorted = Object.entries(zsets[key]).sort((a, b) => a[1] - b[1]);
        const endActual = end === -1 ? sorted.length : end + 1;
        return sorted.slice(start, endActual).map(entry => entry[0]);
      },
      zrangebyscore: async (key: string, min: number, max: number) => {
        if (!zsets[key]) return [];
        const sorted = Object.entries(zsets[key]).sort((a, b) => a[1] - b[1]);
        return sorted
          .filter(([, score]) => score >= min && score <= max)
          .map(([member]) => member);
      },
      zrevrange: async (key: string, start: number, end: number) => {
        if (!zsets[key]) return [];
        const sorted = Object.entries(zsets[key]).sort((a, b) => b[1] - a[1]);
        const endActual = end === -1 ? sorted.length : end + 1;
        return sorted.slice(start, endActual).map(entry => entry[0]);
      },
      zrem: async (key: string, ...members: string[]) => {
        if (!zsets[key]) return 0;
        let count = 0;
        for (const member of members) {
          if (zsets[key][member] !== undefined) {
            delete zsets[key][member];
            count++;
          }
        }
        return count;
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
      smembers: async (key: string) => {
        if (!sets[key]) return [];
        return Array.from(sets[key]);
      },
      mget: async (...keys: string[]) => {
        return keys.map(key => data[key] || null);
      },
      expire: async () => {
        // In fake implementation, just return success (no actual TTL logic)
        return 1;
      },
      setex: async (key: string, ttl: number, value: string) => {
        data[key] = value;
        return "OK";
      },
      keys: async (pattern: string) => {
        // Simple pattern matching for fake implementation
        if (pattern === 'user:*') {
          return Object.keys(hashes).filter(key => key.startsWith('user:'));
        }
        // For other patterns, return all matching keys
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return [...Object.keys(data), ...Object.keys(zsets), ...Object.keys(hashes), ...Object.keys(sets)]
          .filter(key => regex.test(key));
      },
      zscore: async (key: string, member: string) => {
        if (!zsets[key]) return null;
        const score = zsets[key][member];
        return score !== undefined ? score.toString() : null;
      },
      zcard: async (key: string) => {
        if (!zsets[key]) return 0;
        return Object.keys(zsets[key]).length;
      },
      ping: async () => {
        return 'PONG';
      },
      connect: async () => {
        return 'OK';
      },
      on: () => {
        // No-op for fake implementation
        return;
      }
    };
  }

  /**
   * Graceful shutdown of Redis connections
   */
  public async shutdown(): Promise<void> {
    console.log('Redis: Shutting down connections...');
    
    if (this.redis) {
      try {
        await this.redis.quit();
        console.log('Redis: Connection closed gracefully');
      } catch (error) {
        console.error('Redis: Error during shutdown:', error);
      }
    }
    
    this.isConnected = false;
  }
}

// Create and export singleton instance
const redisManager = RedisConnectionManager.getInstance();

// Export the Redis client for backward compatibility
const redis = redisManager.getClient();

// Export additional utilities
export { redisManager };
export default redis; 