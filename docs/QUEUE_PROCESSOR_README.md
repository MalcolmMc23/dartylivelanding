# Queue Processor System - Skip Button Fix

## Problem Solved

Previously, when two users clicked the skip button around the same time, they would both be added to the waiting queue but wouldn't get matched with each other. This was due to:

1. **Race Condition**: Both users were processed as "left behind" users simultaneously
2. **Missing Background Matching**: No proactive system to match users already in the queue
3. **Lock Contention**: Concurrent matching requests could prevent users from finding each other
4. **State Inconsistency**: Users could end up waiting without any active matching attempts

## Solution Implemented

### 1. Background Queue Processor (`src/utils/redis/queueProcessor.ts`)

- **Continuous Processing**: Runs every 3 seconds to actively match users in the queue
- **Priority Matching**: In-call users (from skip scenarios) get higher priority
- **Smart Matching Logic**:
  - In-call users matched with waiting users first
  - In-call users matched with each other if no waiting users
  - Regular waiting users matched with each other
- **Cooldown Respect**: Respects existing cooldown systems to prevent immediate re-matching
- **Time Limits**: Processing is time-bounded to prevent blocking

### 2. Enhanced Hybrid Matching Service (`src/utils/hybridMatchingService.ts`)

- **Auto-Start**: Background processor starts automatically when the service loads
- **Triggered Processing**: Immediately triggers queue processing when users are added
- **Management Functions**: Provides start/stop/status controls for the processor

### 3. Improved Match API (`src/app/api/match-user/route.ts`)

- **Aggressive Triggering**: Additional queue processing for rematching scenarios
- **Delayed Processing**: Gives other users time to join before triggering matches
- **Priority Handling**: Special handling for users left behind after skip

### 4. Enhanced Waiting Status (`src/app/video-chat/hooks/useWaitingStatus.ts`)

- **Frequent Polling**: More responsive checking for matches (every 2 seconds)
- **Proactive Triggering**: Periodically triggers queue processing while waiting
- **Better User Experience**: Reduces time users spend waiting for matches

### 5. Debug Tools

- **Admin Panel Integration**: Queue processor status in the debug panel
- **Manual Triggering**: API endpoint for manual queue processing
- **Status Monitoring**: Real-time processor status and match statistics

## Key Features

### Background Processing

```typescript
// Automatically matches users every 3 seconds
const PROCESSOR_INTERVAL = 3000;

// Smart priority system
const inCallUsers = allQueuedUsers.filter((u) => u.state === "in_call");
const waitingUsers = allQueuedUsers.filter((u) => u.state === "waiting");
```

### Triggered Processing

```typescript
// Immediate processing when users join
setTimeout(async () => {
  await triggerQueueProcessing();
}, 100);
```

### Cooldown Management

```typescript
// Respects existing cooldowns while enabling skip scenarios
const enableBypass = user1.state === "in_call" || user2.state === "in_call";
const canRematchResult = await canRematch(
  user1.username,
  user2.username,
  enableBypass
);
```

## API Endpoints

### `/api/trigger-queue-processing`

- **GET**: Check processor status
- **POST**: Manually trigger queue processing

## Usage

The system works automatically once deployed. For debugging:

1. **Open Debug Panel**: Click "Debug" button in bottom-right corner
2. **Monitor Processor**: See processor status and recent matches
3. **Manual Trigger**: Use the "Trigger" button for immediate processing
4. **Check Status**: GET request to `/api/trigger-queue-processing`

## Testing the Fix

1. **Two User Skip Test**:

   - User A and User B are in a call
   - Both click "Skip" around the same time
   - Both should be matched with each other within 3-6 seconds

2. **Queue Waiting Test**:

   - Multiple users in waiting queue
   - Background processor should match them automatically
   - Admin panel shows real-time queue status

3. **Mixed Scenario Test**:
   - Some users skip (in_call state)
   - Some users join fresh (waiting state)
   - In-call users get priority but everyone gets matched

## Performance

- **Low Impact**: 3-second intervals with 2-second max processing time
- **Lock Management**: Prevents overlapping processing cycles
- **Error Handling**: Graceful error handling with logging
- **Cleanup**: Automatic cleanup of stale users and matches

## Monitoring

Watch for these log messages:

- `Queue processor: Starting queue processing cycle`
- `Queue processor: Successfully matched X with Y`
- `Background queue processor started`
- `Triggering queue processing for waiting user X`

The system is designed to be robust, performant, and provide a much better user experience for skip scenarios.
