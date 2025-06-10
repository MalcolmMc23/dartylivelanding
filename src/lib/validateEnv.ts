export function validateProductionEnv() {
  const required = [
    'REDIS_URL',
    'NEXT_PUBLIC_LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  // Validate Redis URL format
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      if (!['redis:', 'rediss:'].includes(url.protocol)) {
        throw new Error('Redis URL must use redis:// or rediss:// protocol');
      }
    } catch (error) {
      console.error('Invalid REDIS_URL format:', error);
      throw error;
    }
  }

  // Validate LiveKit URL format
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (livekitUrl) {
    try {
      const url = new URL(livekitUrl);
      if (!url.protocol.startsWith('ws')) {
        throw new Error('LiveKit URL must use WebSocket protocol');
      }
    } catch (error) {
      console.error('Invalid NEXT_PUBLIC_LIVEKIT_URL:', error);
      throw error;
    }
  }

  console.log('Environment validation passed');
}

/**
 * Validate Redis connection configuration parameters
 */
export function validateRedisConfig() {
  // Optional Redis configuration validation
  const redisMaxRetries = process.env.REDIS_MAX_RETRIES;
  if (redisMaxRetries) {
    const maxRetries = parseInt(redisMaxRetries, 10);
    if (isNaN(maxRetries) || maxRetries < 1 || maxRetries > 50) {
      throw new Error('REDIS_MAX_RETRIES must be a number between 1 and 50');
    }
  }

  const redisConnectTimeout = process.env.REDIS_CONNECT_TIMEOUT;
  if (redisConnectTimeout) {
    const timeout = parseInt(redisConnectTimeout, 10);
    if (isNaN(timeout) || timeout < 1000 || timeout > 60000) {
      throw new Error('REDIS_CONNECT_TIMEOUT must be a number between 1000 and 60000 (milliseconds)');
    }
  }

  const redisCommandTimeout = process.env.REDIS_COMMAND_TIMEOUT;
  if (redisCommandTimeout) {
    const timeout = parseInt(redisCommandTimeout, 10);
    if (isNaN(timeout) || timeout < 1000 || timeout > 30000) {
      throw new Error('REDIS_COMMAND_TIMEOUT must be a number between 1000 and 30000 (milliseconds)');
    }
  }

  console.log('Redis configuration validation passed');
}

// Run validation in production
if (process.env.NODE_ENV === 'production') {
  validateProductionEnv();
  validateRedisConfig();
} 