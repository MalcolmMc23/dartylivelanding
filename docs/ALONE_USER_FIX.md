# Alone User Detection and Fix Implementation

## Problem Summary
Users were ending up alone in calls due to a race condition in the skip functionality:
1. When User A skips User B, the room is deleted immediately
2. User B only checks for force-disconnect every 2 seconds (now reduced to 1 second)
3. During this window, User B appears to be "alone" in a deleted room

## Solution Implemented

### 1. New Endpoints

#### `/api/simple-matching/check-alone`
- Checks if a user is alone in their current call
- Detects multiple scenarios:
  - Room deleted
  - Partner left (has different match)
  - Partner disconnected (stale heartbeat)
  - Partner not joined yet

#### `/api/simple-matching/kick-alone`
- Kicks a user who is detected as alone
- Cleans up their state
- Re-queues them automatically

### 2. Client-Side Hook: `useAloneDetection`
- Runs when user is in `IN_CALL` state
- Waits 3 seconds initially (to allow both users to join)
- Checks every 2.5 seconds if user is alone
- Requires 2 consecutive "alone" detections to avoid false positives
- Automatically kicks and re-queues the user when alone is confirmed

### 3. Improvements to Existing Code
- Reduced force-disconnect polling from 2s to 1s
- Better error messages based on disconnection reason

## How It Works

1. **During Normal Operation:**
   - Both users join the room
   - Alone detection starts after 3 seconds
   - As long as both users are in the room, nothing happens

2. **When User A Skips User B:**
   - Room is deleted
   - Force-disconnect flag is set for User B
   - User B detects force-disconnect within 1 second OR
   - User B's alone detection kicks in within 2.5 seconds
   - User B is automatically kicked and re-queued

3. **When Network Issues Occur:**
   - If one user's heartbeat becomes stale (>30s)
   - The other user detects they're alone
   - Automatic kick and re-queue happens

## Benefits
- Reduces "alone in call" time from up to 2 seconds to maximum 1 second
- Handles edge cases like network disconnections
- Provides better user feedback with specific error messages
- Automatic recovery without user intervention

## Future Improvements
Consider implementing:
1. WebSocket/SSE for instant notifications instead of polling
2. Redis transactions for atomic operations
3. Pre-skip flags to prevent concurrent skip operations