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

// Run validation in production
if (process.env.NODE_ENV === 'production') {
  validateProductionEnv();
} 