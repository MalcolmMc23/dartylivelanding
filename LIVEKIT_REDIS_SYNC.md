# LiveKit-Redis Synchronization System

This document describes the synchronization system implemented to keep LiveKit room state in sync with Redis database.

## Overview

The synchronization system ensures that:

- Redis accurately reflects the actual participants in LiveKit rooms
- Stale data is automatically cleaned up
- Real-time events from LiveKit are processed to update Redis
- Periodic sync jobs maintain consistency

## Components

### 1. Room Sync Manager (`src/utils/redis/roomSyncManager.ts`)

Handles synchronization between LiveKit and Redis:

- `syncRoomFromLiveKit()` - Syncs a specific room's state from LiveKit to Redis
- `syncAllRoomsWithLiveKit()` - Syncs all active rooms
- `updateRoomState()` - Updates room state in Redis
- `getRoomParticipants()` - Gets cached participants from Redis
- `handleParticipantJoined/Left()` - Handles webhook events

### 2. LiveKit Webhook Handler (`src/app/api/livekit-webhook/route.ts`)

Processes real-time events from LiveKit:

- `participant_joined` - Updates Redis when users join
- `participant_left` - Updates Redis when users leave
- `room_finished` - Cleans up finished rooms

### 3. Sync Service (`src/utils/redis/syncService.ts`)

Background service that runs periodic synchronization:

- Syncs all rooms every 30 seconds
- Cleans up stale rooms every 5 minutes
- Auto-starts on server initialization

### 4. API Endpoints

#### `/api/livekit-webhook` (POST)

Receives webhooks from LiveKit server for real-time updates.

#### `/api/sync-rooms` (GET/POST)

Manual sync control and status:

- GET: Returns sync service status
- POST: Trigger manual sync actions (`sync`, `cleanup`, `full-sync`, `start-service`, `stop-service`)

## Redis Keys

### Room Tracking

- `rooms:participants:{roomName}` - Array of participant identities
- `rooms:states:{roomName}` - Full room state with metadata

### Existing Keys (unchanged)

- `matching:active` - Active matches
- `matching:queue` - User queue
- `left_behind:{username}` - Left-behind user state

## Configuration

### Environment Variables

```bash
# LiveKit Configuration
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
LIVEKIT_HOST=your_livekit_host

# Redis Configuration
REDIS_URL=your_redis_url
```

### LiveKit Webhook Setup

Configure your LiveKit server to send webhooks to:

```
https://your-domain.com/api/livekit-webhook
```

## Usage

### Automatic Sync

The system automatically:

1. Starts sync service on server startup
2. Processes webhook events in real-time
3. Runs periodic sync every 30 seconds
4. Cleans up stale data every 5 minutes

### Manual Sync

```typescript
import { triggerImmediateSync } from "@/utils/redis/syncService";

// Trigger immediate sync
const result = await triggerImmediateSync();
console.log(`Synced ${result.synced} rooms, cleaned ${result.cleaned}`);
```

### Check Sync Status

```typescript
import { isSyncServiceRunning } from "@/utils/redis/syncService";

if (isSyncServiceRunning()) {
  console.log("Sync service is running");
}
```

## Debugging

### Sync Status Component

Use the `SyncStatusIndicator` component to monitor sync status:

```tsx
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";

function DebugPage() {
  return <SyncStatusIndicator />;
}
```

### API Debugging

Check current state via `/api/check-match` GET endpoint:

```json
{
  "activeMatchesCount": 2,
  "roomParticipantsCount": 2,
  "roomStatesCount": 2,
  "syncServiceRunning": true,
  "roomParticipants": {
    "room-123": ["user1", "user2"]
  },
  "roomStates": {
    "room-123": {
      "roomName": "room-123",
      "participants": [...],
      "isActive": true,
      "lastUpdated": 1234567890
    }
  }
}
```

## Benefits

1. **Real-time Accuracy**: Webhook events ensure immediate updates
2. **Fault Tolerance**: Periodic sync catches missed events
3. **Automatic Cleanup**: Stale data is automatically removed
4. **Debugging Tools**: Built-in status monitoring and manual controls
5. **Scalability**: Redis-based tracking scales better than in-memory

## Migration Notes

- Replaced in-memory `roomParticipants` object with Redis-based tracking
- Added webhook endpoint for real-time updates
- Maintained backward compatibility with existing queue system
- Added comprehensive debugging and monitoring tools

## Troubleshooting

### Sync Service Not Running

```bash
curl -X POST https://your-domain.com/api/sync-rooms \
  -H "Content-Type: application/json" \
  -d '{"action": "start-service"}'
```

### Manual Sync

```bash
curl -X POST https://your-domain.com/api/sync-rooms \
  -H "Content-Type: application/json" \
  -d '{"action": "full-sync"}'
```

### Check Status

```bash
curl https://your-domain.com/api/sync-rooms
```
