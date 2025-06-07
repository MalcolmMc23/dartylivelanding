# Skip Race Condition Fix

## Problem Analysis

Users sometimes end up alone in rooms when their partner skips due to several race conditions:

1. **2-4 second detection delay**: Force-disconnect flags are checked every 2 seconds via polling
2. **Non-atomic operations**: Room deletion and state updates happen sequentially
3. **Multiple grace periods**: Various delays (1.5s room deletion wait, 3s connection state logger) create timing windows

## Key Race Conditions

### 1. Force-Disconnect Detection Lag
- User A skips User B
- User B's client won't detect the force-disconnect flag for up to 2 seconds
- During this window, User B appears to be "alone" in a deleted room

### 2. Room Deletion vs State Update Race
- LiveKit room is deleted before the other user's state is fully cleaned
- The other user's client still thinks they're in a valid room

### 3. Concurrent Skip Operations
- Both users skip at nearly the same time
- Lock mechanisms aren't truly atomic (check-then-set pattern)

## Proposed Solution

### 1. Implement Server-Sent Events (SSE) for Real-Time Notifications

Replace polling with push notifications for immediate updates:

```typescript
// src/app/api/sse/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  
  if (!userId) {
    return new Response('User ID required', { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Subscribe to Redis pub/sub for this user
      const subscriber = redis.duplicate();
      await subscriber.subscribe(`user:${userId}:events`);
      
      subscriber.on('message', (channel, message) => {
        const data = `data: ${message}\n\n`;
        controller.enqueue(encoder.encode(data));
      });
      
      // Send heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode('data: {"type":"heartbeat"}\n\n'));
      }, 30000);
      
      // Cleanup on disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe();
        subscriber.disconnect();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### 2. Update Skip Logic with Atomic Operations

```typescript
// src/app/api/simple-matching/skip/route.ts (updated)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, sessionId } = body;

    // Use Redis transaction for atomic operations
    const multi = redis.multi();
    
    // Get match data first
    const matchData = await redis.get(`match:${userId}`);
    if (!matchData) {
      return NextResponse.json({ success: true, message: 'No active match' });
    }
    
    const match = JSON.parse(matchData);
    const otherUserId = match.user1 === userId ? match.user2 : match.user1;
    
    // Atomic state transition using Redis transaction
    multi
      // Set skip state for both users
      .setex(`skip-state:${userId}`, 120, 'skipped')
      .setex(`skip-state:${otherUserId}`, 7200, 'was-skipped') // Longer TTL for the skipped user
      // Publish real-time notifications
      .publish(`user:${otherUserId}:events`, JSON.stringify({
        type: 'force-disconnect',
        reason: 'partner-skipped',
        timestamp: Date.now()
      }))
      // Remove from queues
      .zrem('matching:waiting', userId, otherUserId)
      .zrem('matching:in_call', userId, otherUserId)
      // Delete match data
      .del(`match:${userId}`, `match:${otherUserId}`)
      // Set re-queue flags
      .setex(`requeue-after-skip:${userId}`, 5, 'true')
      .setex(`requeue-after-skip:${otherUserId}`, 5, 'true');
    
    // Execute all operations atomically
    await multi.exec();
    
    // Delete LiveKit room asynchronously (fire-and-forget)
    deleteRoom(match.roomName).catch(err => 
      console.error('Error deleting room:', err)
    );
    
    // Re-queue both users asynchronously
    setTimeout(() => requeueUsers(userId, otherUserId), 100);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Skip error:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
```

### 3. Update Client to Use SSE

```typescript
// src/components/hooks/useSSEConnection.ts
export function useSSEConnection(userId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    if (!userId) return;
    
    const eventSource = new EventSource(`/api/sse?userId=${userId}`);
    
    eventSource.onopen = () => setIsConnected(true);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'force-disconnect':
          // Immediate notification - no polling delay
          handleForceDisconnect(data.reason);
          break;
        case 'new-match':
          handleNewMatch(data);
          break;
        case 'heartbeat':
          // Keep connection alive
          break;
      }
    };
    
    eventSource.onerror = () => {
      setIsConnected(false);
      // Reconnect after 1 second
      setTimeout(() => {
        eventSource.close();
        // Component will re-render and create new connection
      }, 1000);
    };
    
    return () => eventSource.close();
  }, [userId]);
  
  return isConnected;
}
```

### 4. Add Connection State Synchronization

```typescript
// src/utils/redis/skipManager.ts
export class SkipManager {
  async handleSkip(userId: string, otherUserId: string) {
    // Use Lua script for atomic check-and-skip
    const luaScript = `
      local userId = KEYS[1]
      local otherUserId = KEYS[2]
      local roomName = KEYS[3]
      local now = ARGV[1]
      
      -- Check if already being processed
      if redis.call("exists", "skip-processing:" .. userId) == 1 then
        return {0, "already-processing"}
      end
      
      -- Set processing flag
      redis.call("setex", "skip-processing:" .. userId, 10, "1")
      redis.call("setex", "skip-processing:" .. otherUserId, 10, "1")
      
      -- Atomic state transition
      redis.call("setex", "skip-state:" .. userId, 120, "skipped")
      redis.call("setex", "skip-state:" .. otherUserId, 120, "was-skipped")
      
      -- Publish events
      redis.call("publish", "user:" .. userId .. ":events", '{"type":"skip-confirmed"}')
      redis.call("publish", "user:" .. otherUserId .. ":events", '{"type":"force-disconnect","reason":"partner-skipped"}')
      
      -- Clean up states
      redis.call("zrem", "matching:waiting", userId, otherUserId)
      redis.call("zrem", "matching:in_call", userId, otherUserId)
      redis.call("del", "match:" .. userId, "match:" .. otherUserId)
      
      return {1, "success"}
    `;
    
    const result = await redis.eval(
      luaScript,
      3,
      userId,
      otherUserId,
      roomName,
      Date.now()
    );
    
    return result;
  }
}
```

### 5. Implement Graceful Room Cleanup

```typescript
// src/utils/roomCleanupManager.ts
export class RoomCleanupManager {
  async cleanupRoom(roomName: string, user1: string, user2: string) {
    // Notify both users BEFORE deleting the room
    await Promise.all([
      redis.publish(`user:${user1}:events`, JSON.stringify({
        type: 'room-closing',
        roomName,
        reason: 'skip'
      })),
      redis.publish(`user:${user2}:events`, JSON.stringify({
        type: 'room-closing',
        roomName,
        reason: 'partner-skipped'
      }))
    ]);
    
    // Wait for clients to acknowledge (with timeout)
    await Promise.race([
      this.waitForAcknowledgments([user1, user2]),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);
    
    // Now safe to delete room
    await deleteRoom(roomName);
  }
  
  private async waitForAcknowledgments(userIds: string[]) {
    const acks = await Promise.all(
      userIds.map(userId => 
        redis.blpop(`room-close-ack:${userId}`, 1)
      )
    );
    return acks;
  }
}
```

## Implementation Steps

1. **Phase 1**: Implement SSE endpoint and update client to use it alongside polling
2. **Phase 2**: Add atomic Redis operations using transactions and Lua scripts
3. **Phase 3**: Implement graceful room cleanup with notifications
4. **Phase 4**: Remove polling once SSE is stable

## Testing Plan

1. Test concurrent skips with two users skipping simultaneously
2. Test network delays by adding artificial latency
3. Test rapid skip sequences (user skips multiple partners quickly)
4. Monitor for "alone in room" events using telemetry

## Monitoring

Add metrics to track:
- Time between skip and partner notification
- Instances of users alone in rooms
- Skip operation success rates
- SSE connection stability