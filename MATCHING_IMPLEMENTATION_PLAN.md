# Matching Implementation Plan

Based on the architecture in `instructions/Matching.md`, here's what needs to be implemented to complete the Omegle-style video chat matching system.

## Current State Summary
- ✅ Basic HTTP API endpoints (enqueue, skip, end, status)
- ✅ Redis queue structure (waiting, in_call)
- ✅ Database schema (users, sessions, blocklist)
- ✅ LiveKit room creation and token generation
- ❌ Real-time notifications (WebSocket/SSE)
- ❌ LiveKit webhooks for state sync
- ❌ Proper authentication integration
- ❌ Queue polling in frontend
- ❌ Blocklist filtering
- ❌ Rate limiting
- ❌ Session heartbeat/cleanup

## Priority 1: Core Real-time Features

### 1. WebSocket/SSE for Match Notifications
**Why**: Users in queue need immediate notification when matched

**Implementation**:
```typescript
// Option A: Server-Sent Events (Simpler)
// Create: src/app/api/matching/events/route.ts
// - Stream queue updates to waiting users
// - Notify when match is found with session details

// Option B: WebSocket (More complex, bidirectional)
// Create: src/lib/websocket.ts
// - Establish WS connection on enqueue
// - Send match notifications
// - Handle disconnections
```

**Steps**:
1. Create SSE endpoint `/api/matching/events`
2. Modify enqueue to store connection info
3. When match found, send event to waiting user
4. Update frontend to establish EventSource connection

### 2. LiveKit Webhook Handlers
**Why**: Sync room state when users disconnect unexpectedly

**Implementation**:
```typescript
// Create: src/app/api/livekit/webhooks/route.ts
// Handle events:
// - participant_joined
// - participant_left
// - room_finished
```

**Steps**:
1. Create webhook endpoint
2. Verify webhook signatures (security)
3. Update session/user status on disconnect
4. Clean up Redis state
5. Configure LiveKit to send webhooks

### 3. Fix Authentication Integration
**Why**: Currently using mock user IDs

**Steps**:
1. Update `VideoChatController` to get username from session
2. Remove MOCK_USER_ID constant
3. Ensure all API calls use authenticated username
4. Add proper error handling for unauthenticated users

## Priority 2: Reliability & UX

### 4. Implement Queue Status Polling
**Why**: Show real queue position while waiting

**Implementation**:
```typescript
// Update: src/app/video-chat/components/MatchingQueue.tsx
// - Poll /api/matching/status every 2 seconds
// - Display actual queue position
// - Show estimated wait time
```

**Steps**:
1. Add polling logic to MatchingQueue component
2. Use actual API data instead of fake countdown
3. Stop polling when matched or cancelled

### 5. Session Heartbeat Mechanism
**Why**: Detect and clean up abandoned sessions

**Implementation**:
```typescript
// Create: src/app/api/matching/heartbeat/route.ts
// Update: src/lib/redis.ts - add heartbeat tracking
```

**Steps**:
1. Add heartbeat endpoint
2. Frontend sends heartbeat every 30s during call
3. Mark sessions as stale after 60s without heartbeat
4. Background job to clean stale sessions

### 6. Automatic Session Cleanup
**Why**: Prevent orphaned rooms and stuck users

**Implementation**:
- Cron job or background worker
- Clean up sessions older than X minutes
- Delete associated LiveKit rooms
- Update user statuses

## Priority 3: Safety & Moderation

### 7. Blocklist Filtering
**Why**: Users should not match with blocked users

**Steps**:
1. Update enqueue logic to filter blocked users
2. Query blocklist table during matching
3. Skip blocked users in queue

### 8. Rate Limiting for Skips
**Why**: Prevent abuse of skip feature

**Implementation**:
```typescript
// Track in Redis:
// - skip_count:{userId} - count of skips
// - skip_cooldown:{userId} - timestamp of cooldown end
```

**Steps**:
1. Increment skip counter on each skip
2. Implement exponential cooldown (1min, 5min, 15min)
3. Return error if in cooldown period
4. Reset counter after successful conversation

## Implementation Order

1. **Week 1**: 
   - Fix authentication (Priority 1.3)
   - Implement SSE for match notifications (Priority 1.1)
   - Add queue status polling (Priority 2.4)

2. **Week 2**:
   - LiveKit webhook handlers (Priority 1.2)
   - Session heartbeat mechanism (Priority 2.5)
   - Automatic cleanup (Priority 2.6)

3. **Week 3**:
   - Blocklist filtering (Priority 3.7)
   - Rate limiting (Priority 3.8)
   - Testing and bug fixes

## Testing Checklist

- [ ] User can enqueue and get matched
- [ ] Waiting user gets notified when matched
- [ ] Queue position updates in real-time
- [ ] Skip creates new match quickly
- [ ] Disconnected users are cleaned up
- [ ] Blocked users don't match
- [ ] Rate limiting prevents skip abuse
- [ ] No orphaned rooms or sessions
- [ ] Concurrent matching works correctly

## Environment Variables Needed

```env
# LiveKit
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_WEBHOOK_SECRET=your-webhook-secret

# Redis
REDIS_URL=redis://localhost:6379

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Database Migrations Needed

```sql
-- Add heartbeat tracking
ALTER TABLE sessions 
ADD COLUMN last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add skip tracking
ALTER TABLE users
ADD COLUMN skip_count INTEGER DEFAULT 0,
ADD COLUMN skip_cooldown_until TIMESTAMP WITH TIME ZONE;

-- Add indexes for performance
CREATE INDEX idx_sessions_active ON sessions(ended_at) WHERE ended_at IS NULL;
CREATE INDEX idx_blocklist_lookup ON blocklist(blocker_username, blocked_username);
```