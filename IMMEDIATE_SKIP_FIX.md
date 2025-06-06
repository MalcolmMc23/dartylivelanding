# Immediate Skip Race Condition Fix

## Quick Fix (Can be implemented immediately)

### 1. Reduce Polling Interval

Update client polling to 500ms instead of 2000ms for faster detection:

```typescript
// In components that check for force-disconnect
const POLL_INTERVAL = 500; // Reduced from 2000ms
```

### 2. Update Skip Route for Better Atomicity

```typescript
// src/app/api/simple-matching/skip/route.ts

// Add this at the top of the POST function:
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, sessionId } = body;

    // IMMEDIATE FIX: Set pre-skip state to prevent race conditions
    await redis.setex(`pre-skip:${userId}`, 30, 'true');
    
    // Get match data
    const matchData = await redis.get(`match:${userId}`);
    if (!matchData) {
      return NextResponse.json({ success: true, message: 'No active match' });
    }
    
    const match = JSON.parse(matchData);
    const otherUserId = match.user1 === userId ? match.user2 : match.user1;
    
    // IMMEDIATE FIX: Set skip state for BOTH users BEFORE any cleanup
    await Promise.all([
      redis.setex(`skip-in-progress:${userId}`, 60, 'true'),
      redis.setex(`skip-in-progress:${otherUserId}`, 60, 'true'),
      redis.setex(`force-disconnect:${otherUserId}`, 300, 'true'), // Increased TTL
      redis.setex(`room-deleted:${match.roomName}`, 300, 'true')
    ]);
    
    // Continue with existing logic...
```

### 3. Add Skip-In-Progress Check to Client

```typescript
// Add to check-disconnect endpoint
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  
  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }
  
  // Check multiple flags for redundancy
  const [forceDisconnect, skipInProgress, preSkip] = await Promise.all([
    redis.get(`force-disconnect:${userId}`),
    redis.get(`skip-in-progress:${userId}`),
    redis.get(`pre-skip:${userId}`)
  ]);
  
  const shouldDisconnect = forceDisconnect || skipInProgress || preSkip;
  
  if (shouldDisconnect) {
    // Clear the flags
    await Promise.all([
      redis.del(`force-disconnect:${userId}`),
      redis.del(`skip-in-progress:${userId}`),
      redis.del(`pre-skip:${userId}`)
    ]);
    
    return NextResponse.json({ forceDisconnect: true });
  }
  
  return NextResponse.json({ forceDisconnect: false });
}
```

### 4. Add Room State Check

```typescript
// Add to client polling logic
const checkRoomStillValid = async () => {
  if (roomName) {
    const roomDeleted = await redis.get(`room-deleted:${roomName}`);
    if (roomDeleted) {
      // Force disconnect immediately
      handleForceDisconnect('Room has been closed');
      return false;
    }
  }
  return true;
};
```

### 5. Update Room Component to Check State More Frequently

```typescript
// In room components, add immediate disconnect on room events
useEffect(() => {
  if (room) {
    // Listen for room deletion events
    room.on(RoomEvent.Disconnected, (reason) => {
      if (reason === DisconnectReason.ROOM_DELETED) {
        // Immediate handling - no waiting for polls
        setConnectionState('disconnected');
        handleSkipScenario();
      }
    });
  }
}, [room]);
```

## Deployment Steps

1. Deploy the updated skip route with pre-skip flags
2. Update the check-disconnect endpoint to check multiple flags
3. Reduce client polling interval to 500ms
4. Add room deletion event listeners

## Expected Improvements

- Detection time reduced from 2-4 seconds to 0.5-1 second
- Multiple redundant flags prevent missed disconnections
- Room deletion events provide immediate notification
- Pre-skip state prevents concurrent skip race conditions

## Monitoring After Deployment

Track these metrics:
```javascript
// Add to skip route
console.log('[Skip] Timing:', {
  skipInitiated: Date.now(),
  userId,
  otherUserId,
  roomName: match.roomName
});

// Add to client when detecting skip
console.log('[Client] Skip detected:', {
  detectionTime: Date.now(),
  method: 'polling' | 'room-event' | 'force-disconnect',
  userId
});
```