# Setup Guide - Fixing Matching System Issues

## Quick Fix for Current Issues

The matching system is experiencing several issues that can be resolved by following these steps:

### 1. Reset the System

First, clear all stuck states:

```bash
# Reset everything
curl -X POST http://localhost:3000/api/debug/reset-system \
  -H "Content-Type: application/json" \
  -d '{"action":"full"}'

# Or just clear cooldowns (less aggressive)
curl -X POST http://localhost:3000/api/debug/reset-system \
  -H "Content-Type: application/json" \
  -d '{"action":"cooldowns"}'
```

### 2. Fix LiveKit Configuration

The logs show "LiveKit configuration missing" errors. Add these environment variables:

```bash
# Option 1: Use LiveKit Demo (for testing)
# No additional setup needed - the system will use demo credentials

# Option 2: Use your own LiveKit server
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
LIVEKIT_HOST=your-server.com
NEXT_PUBLIC_LIVEKIT_URL=wss://your-server.com

# Option 3: Use LiveKit Cloud (recommended)
# Sign up at https://cloud.livekit.io/
LIVEKIT_API_KEY=your_cloud_api_key
LIVEKIT_API_SECRET=your_cloud_api_secret
LIVEKIT_HOST=your-project.livekit.cloud
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### 3. Use Debug Dashboard

Visit the debug dashboard to monitor and fix issues:

```
http://localhost:3000/debug/system
```

This page provides:

- System status overview
- One-click reset buttons
- Cooldown management
- Environment variable status

### 4. Test the System

1. **Clear all cooldowns**: This will allow immediate matching
2. **Use demo mode**: Add `?useDemo=true` to video chat URLs for testing
3. **Monitor logs**: Watch for "LiveKit configuration missing" errors

## Common Issues & Solutions

### Users Stuck in Queue

- **Cause**: Aggressive cooldowns preventing matches
- **Solution**: Clear cooldowns or reduce cooldown times (already done)

### LiveKit Connection Errors

- **Cause**: Missing environment variables
- **Solution**: Set up LiveKit credentials or use demo mode

### Users Alone in Rooms

- **Cause**: Partner disconnected but user not reset
- **Solution**: The alone user processor should handle this automatically (5-second timeout)

### No Matches Being Created

- **Cause**: System state corruption
- **Solution**: Full system reset

## Environment Variables

Create a `.env.local` file with:

```bash
# Required
REDIS_URL=redis://localhost:6379

# LiveKit (choose one option)
# Option A: Demo mode (no setup required)
# Option B: Your server
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
LIVEKIT_HOST=your_host
NEXT_PUBLIC_LIVEKIT_URL=wss://your_host

# Optional
NEXT_PUBLIC_USE_SIMPLE_QUEUE=true
```

## Testing Steps

1. **Reset the system**:

   ```bash
   curl -X POST http://localhost:3000/api/debug/reset-system -H "Content-Type: application/json" -d '{"action":"full"}'
   ```

2. **Test with demo mode**:

   - Visit: `http://localhost:3000/video-chat?username=test1&useDemo=true`
   - Open another tab: `http://localhost:3000/video-chat?username=test2&useDemo=true`

3. **Check queue processing**:

   ```bash
   curl -X POST http://localhost:3000/api/trigger-queue-processing
   ```

4. **Monitor system status**:
   ```bash
   curl http://localhost:3000/api/debug/reset-system
   ```

## Debug URLs

- **System Dashboard**: `/debug/system`
- **Alone Users**: `/debug/alone-users`
- **API Status**: `/api/debug/reset-system` (GET)
- **Queue Trigger**: `/api/trigger-queue-processing` (POST)

## Changes Made

1. **Reduced cooldown times**: 10s normal, 30s skip (was 30s/120s)
2. **Improved LiveKit config**: Better fallback handling
3. **Added debug tools**: System reset and monitoring
4. **Fixed alone user tracking**: Automatic 5-second reset

The system should now be much more responsive and less likely to get stuck!
