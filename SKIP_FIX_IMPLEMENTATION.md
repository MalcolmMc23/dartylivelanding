# Skip Race Condition Fix - Implementation Code

## Step 1: Update check-disconnect to check multiple flags

Replace `/src/app/api/simple-matching/check-disconnect/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    // Check multiple disconnect flags for redundancy
    const [
      forceDisconnect,
      skipInProgress,
      preSkip,
      matchData
    ] = await Promise.all([
      redis.get(`force-disconnect:${userId}`),
      redis.get(`skip-in-progress:${userId}`),
      redis.get(`pre-skip:${userId}`),
      redis.get(`match:${userId}`)
    ]);
    
    // Also check if room was deleted
    let roomDeleted = false;
    if (matchData) {
      const match = JSON.parse(matchData);
      roomDeleted = await redis.get(`room-deleted:${match.roomName}`) !== null;
    }
    
    const shouldDisconnect = !!(forceDisconnect || skipInProgress || preSkip || roomDeleted);
    
    if (shouldDisconnect) {
      // Clear all flags atomically
      const keysToDelete = [
        `force-disconnect:${userId}`,
        `skip-in-progress:${userId}`,
        `pre-skip:${userId}`
      ];
      
      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
      }
      
      console.log(`[CheckDisconnect] User ${userId} should disconnect. Flags:`, {
        forceDisconnect: !!forceDisconnect,
        skipInProgress: !!skipInProgress,
        preSkip: !!preSkip,
        roomDeleted
      });
      
      return NextResponse.json({
        success: true,
        shouldDisconnect: true,
        reason: forceDisconnect ? 'force-disconnect' : 
                skipInProgress ? 'skip-in-progress' : 
                preSkip ? 'pre-skip' :
                roomDeleted ? 'room-deleted' : 'unknown'
      });
    }
    
    return NextResponse.json({
      success: true,
      shouldDisconnect: false
    });
  } catch (error) {
    console.error('Error checking disconnect:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 2: Update skip route with atomic operations

Add these changes to `/src/app/api/simple-matching/skip/route.ts` at the beginning of the POST function:

```typescript
// At line 25, after getting userId and sessionId, add:

    // IMMEDIATE FIX: Set pre-skip state to prevent race conditions
    await redis.setex(`pre-skip:${userId}`, 30, 'true');
    console.log(`[Skip] Pre-skip flag set for ${userId}`);

    // Get match data
    const matchData = await redis.get(`match:${userId}`);
    if (!matchData) {
      // Clear pre-skip flag if no match
      await redis.del(`pre-skip:${userId}`);
      return NextResponse.json({ success: true, message: 'No active match' });
    }
    
    const match = JSON.parse(matchData);
    const roomName = match.roomName;
    const otherUserId = match.user1 === userId ? match.user2 : match.user1;
    
    // IMMEDIATE FIX: Set multiple flags ATOMICALLY before any cleanup
    const flagPromises = [
      redis.setex(`skip-in-progress:${userId}`, 60, 'true'),
      redis.setex(`skip-in-progress:${otherUserId}`, 60, 'true'),
      redis.setex(`force-disconnect:${otherUserId}`, 300, 'true'), // 5 min TTL
      redis.setex(`room-deleted:${roomName}`, 300, 'true'),
      // Also set a skip notification for the other user
      redis.setex(`skip-notification:${otherUserId}`, 300, JSON.stringify({
        skippedBy: userId,
        timestamp: Date.now(),
        roomName
      }))
    ];
    
    await Promise.all(flagPromises);
    console.log(`[Skip] All skip flags set for users ${userId} and ${otherUserId}`);

    // Continue with the existing logic at line 58 (Delete LiveKit room)
```

## Step 3: Reduce polling interval in clients

Update the following specific files:

### In `/src/components/hooks/useLeftBehindStatus.ts` at line 88:
```typescript
// Change from:
const interval = setInterval(checkStatus, 2000); // Check every 2 seconds
// To:
const interval = setInterval(checkStatus, 500); // Check every 500ms for faster detection
```

### In `/src/app/random-chat/page.tsx` (if using this component):
Find any `setInterval` calls with 2000ms delays and reduce them to 500ms.

### For any new components using polling:
```typescript
const POLL_INTERVAL = 500; // Use 500ms instead of 2000ms
```

## Step 4: Add immediate room state check

Create a new API endpoint `/src/app/api/simple-matching/check-room-valid/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request) {
  try {
    const { roomName, userId } = await request.json();

    if (!roomName || !userId) {
      return NextResponse.json(
        { success: false, error: 'Room name and user ID required' },
        { status: 400 }
      );
    }

    // Check if room was deleted
    const roomDeleted = await redis.get(`room-deleted:${roomName}`);
    
    // Also check user's skip status
    const [skipInProgress, forceDisconnect] = await Promise.all([
      redis.get(`skip-in-progress:${userId}`),
      redis.get(`force-disconnect:${userId}`)
    ]);
    
    const isValid = !roomDeleted && !skipInProgress && !forceDisconnect;
    
    return NextResponse.json({
      success: true,
      valid: isValid,
      reason: roomDeleted ? 'room-deleted' : 
              skipInProgress ? 'skip-in-progress' : 
              forceDisconnect ? 'force-disconnect' : null
    });
  } catch (error) {
    console.error('Error checking room validity:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Step 5: Update client to handle disconnects immediately

In components that handle room connections, add this to the disconnect check:

```typescript
// Add to the polling logic or useEffect
const checkDisconnectStatus = async () => {
  try {
    const response = await fetch('/api/simple-matching/check-disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    
    const data = await response.json();
    
    if (data.shouldDisconnect) {
      console.log(`[Client] Disconnect detected: ${data.reason}`);
      // Handle disconnect immediately
      setForceDisconnected(true);
      setConnectionState('disconnected');
      
      // Show appropriate message based on reason
      if (data.reason === 'force-disconnect' || data.reason === 'skip-in-progress') {
        setErrorMessage('Your partner has skipped - finding new match...');
      } else if (data.reason === 'room-deleted') {
        setErrorMessage('Connection ended - finding new match...');
      }
      
      // Clear error after 3 seconds
      setTimeout(() => setErrorMessage(''), 3000);
      
      // Disconnect from LiveKit room if connected
      if (room) {
        await room.disconnect();
      }
      
      // Re-queue user
      handleRequeue();
    }
  } catch (error) {
    console.error('Error checking disconnect status:', error);
  }
};
```

## Testing the Fix

1. Deploy these changes
2. Test with two users where one skips
3. Monitor logs for timing:
   - Time when skip is initiated
   - Time when other user detects disconnect
   - Should be < 1 second instead of 2-4 seconds

## Monitoring

Add these log lines to track improvement:

```typescript
// In skip route
console.log('[Skip] Performance:', {
  skipStart: Date.now(),
  userId,
  otherUserId,
  roomName
});

// In client when detecting skip
console.log('[Client] Skip detected:', {
  detectedAt: Date.now(),
  detectionMethod: 'polling',
  timeSinceLastCheck: Date.now() - lastCheckTime
});
```