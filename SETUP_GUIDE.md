# Setup Guide

## Quick Fix for Current Issues

This project no longer includes a matching system. All references to matching, queue processing, and related debug tools have been removed.

### 1. LiveKit Configuration

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
```

## Debug URLs

- **System Dashboard**: `/debug/system`
- **Alone Users**: `/debug/alone-users`
- **API Status**: `/api/debug/reset-system` (GET)

## Changes Made

- Removed all matching system logic, endpoints, and debug tools.
- Improved LiveKit config: Better fallback handling
- Fixed alone user tracking: Automatic 5-second reset

The system should now be much more responsive and less likely to get stuck!
