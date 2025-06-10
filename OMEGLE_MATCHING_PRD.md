<context>
# Overview  
This PRD outlines the redesign of the DormParty matching system to function like Omegle, with clear skip/end button behaviors and robust user state management. The system will ensure users never end up alone in calls and provide a seamless experience for random video chat connections.

# Core Features  

## 1. User State Management
**What it does**: Tracks user states throughout their journey in the application
**Why it's important**: Prevents edge cases like users being alone in rooms and ensures smooth transitions
**How it works**:
- IDLE: User is on landing page, not actively matching
- WAITING: User is in the matching queue looking for a partner
- CONNECTING: Match found, establishing video connection
- IN_CALL: Active video call with matched partner
- NEW: DISCONNECTING: Transitional state when leaving a call

## 2. Skip Button
**What it does**: Immediately disconnects both users and returns them to the matching queue
**Why it's important**: Provides users a way to quickly move to the next match if current one isn't suitable
**How it works**:
- When clicked, disconnects both users from the video call
- Both users automatically enter WAITING state and rejoin the queue
- No attempt to match with others already in queue
- Simple cooldown prevents immediate re-matching with same person

## 3. End Button  
**What it does**: Ends the session for the clicking user while re-queuing their partner
**Why it's important**: Allows users to stop matching without affecting their partner's experience
**How it works**:
- User who clicks End → IDLE state (returns to landing page)
- Other user → WAITING state (automatically re-queued)
- Clear differentiation between who initiated the end
- Prevents abandoned users in rooms

## 4. Robust Room Management
**What it does**: Ensures rooms are properly created, managed, and destroyed
**Why it's important**: Prevents resource leaks and ensures users never end up alone
**How it works**:
- Atomic room creation with participant tracking
- Force disconnection flags for immediate detection
- Room deletion triggers automatic state transitions
- Multiple redundant checks prevent solo room scenarios

# User Experience  

## User Personas
1. **Quick Skipper**: Rapidly skips through matches to find interesting conversations
2. **Long Talker**: Engages in extended conversations before moving on
3. **Casual Browser**: Uses the platform intermittently, may end sessions abruptly

## Key User Flows

### Starting a Match
1. User clicks "Start Chatting" from landing page
2. State: IDLE → WAITING
3. System adds user to queue
4. When match found: WAITING → CONNECTING → IN_CALL
5. Video call established with matched partner

### Skipping a Match
1. User clicks "SKIP" button during call
2. Both users: IN_CALL → DISCONNECTING → WAITING
3. Room destroyed, both users re-enter queue
4. 30-second cooldown prevents re-matching same pair
5. Each user waits for new match

### Ending a Session
1. User clicks "END" button during call
2. Clicking user: IN_CALL → DISCONNECTING → IDLE
3. Other user: IN_CALL → DISCONNECTING → WAITING  
4. Clicking user returns to landing page
5. Other user automatically queued for next match

### Edge Case Handling
- Browser close/refresh: Beacon API ensures cleanup
- Network disconnection: Heartbeat timeout triggers cleanup
- Concurrent actions: Atomic operations prevent conflicts
</context>
<PRD>
# Technical Architecture  

## System Components

### 1. State Management
- **Redis Sorted Sets**: Track users in different states (waiting, in_call)
- **State Keys**: 
  - `matching:waiting` - Users in queue with join timestamp
  - `matching:in_call` - Active call participants
  - `matching:idle` - NEW: Users in idle state
- **User Metadata**: Store current state, last action timestamp

### 2. Matching Engine
- **Queue Processing**: FIFO matching from waiting queue
- **Match Creation**: Atomic operation creating room and updating states
- **Cooldown System**: Prevent same-pair matching for 30 seconds
- **State Transitions**: Explicit state machine with validation

### 3. Room Management  
- **LiveKit Integration**: WebRTC room creation/deletion
- **Room Lifecycle**:
  - Create on match with 2-participant limit
  - Monitor participant count
  - Auto-delete when empty
  - Force delete on skip/end
- **Disconnect Detection**: Multiple flags for redundancy

### 4. API Endpoints

#### `/api/simple-matching/enqueue`
- Add user to waiting queue
- Return queued status (no immediate matching)
- Clean up stale users

#### `/api/simple-matching/skip`
- Set disconnection flags for both users
- Delete LiveKit room
- Move both users to WAITING state
- Re-add to queue with cooldown

#### `/api/simple-matching/end`
- Set disconnection flag for other user
- Delete LiveKit room
- Move ending user to IDLE state
- Move other user to WAITING state

#### `/api/simple-matching/check-match`
- Poll for match availability
- Return match data when found
- Handle state transitions

#### `/api/simple-matching/check-disconnect`
- Poll for disconnection flags
- Return disconnect reason (skip/end)
- Trigger appropriate state transition

## Data Models

### User State
```typescript
interface UserState {
  userId: string;
  state: 'IDLE' | 'WAITING' | 'CONNECTING' | 'IN_CALL' | 'DISCONNECTING';
  lastHeartbeat: number;
  currentRoom?: string;
  matchedWith?: string;
}
```

### Match Data
```typescript
interface MatchData {
  sessionId: string;
  roomName: string;
  user1: string;
  user2: string;
  createdAt: number;
}
```

### Disconnect Notification
```typescript
interface DisconnectNotification {
  reason: 'skip' | 'end';
  initiatedBy: string;
  timestamp: number;
  targetState: 'WAITING' | 'IDLE';
}
```

## State Machine

```
IDLE → WAITING → CONNECTING → IN_CALL → DISCONNECTING → (IDLE | WAITING)
```

### Valid Transitions
- IDLE → WAITING: User starts matching
- WAITING → CONNECTING: Match found
- CONNECTING → IN_CALL: Connection established
- IN_CALL → DISCONNECTING: Skip or End clicked
- DISCONNECTING → IDLE: User who clicked End
- DISCONNECTING → WAITING: User who was skipped or ended on

# Development Roadmap  

## Phase 1: Core State Management (MVP)
- Implement IDLE state in Redis
- Add DISCONNECTING transitional state
- Create state validation middleware
- Update all API endpoints to respect state machine
- Add state transition logging

## Phase 2: Skip Button Redesign
- Simplify skip logic to remove immediate re-matching
- Both users go directly to WAITING state
- Implement proper cooldown between same users
- Add skip reason to disconnect notifications
- Update frontend to handle new skip flow

## Phase 3: End Button Implementation  
- Differentiate End from Skip in API
- Implement IDLE state transition for ending user
- Auto-queue other user to WAITING
- Update UI to show appropriate post-end state
- Add analytics for end vs skip usage

## Phase 4: Robustness Improvements
- Enhance disconnect detection to sub-500ms
- Add more redundant flags for critical operations  
- Implement state recovery mechanisms
- Add comprehensive error handling
- Create automated tests for edge cases

## Phase 5: Monitoring & Analytics
- Add state transition metrics
- Monitor average time in each state
- Track skip/end rates
- Identify and log anomalous patterns
- Create admin dashboard for system health

# Logical Dependency Chain

1. **State Management Foundation** (Phase 1)
   - Must be completed first as all other features depend on it
   - Provides the framework for proper user lifecycle

2. **Skip Button Redesign** (Phase 2)
   - Depends on state management
   - Simpler implementation makes it good next step
   - Tests the state transition system

3. **End Button Implementation** (Phase 3)
   - Builds on skip functionality
   - Adds complexity with IDLE state handling
   - Completes core user actions

4. **Robustness Improvements** (Phase 4)
   - Requires core features working
   - Focuses on edge cases and reliability
   - Can be done iteratively

5. **Monitoring & Analytics** (Phase 5)
   - Needs stable system to monitor
   - Provides insights for future improvements
   - Helps identify remaining issues

# Risks and Mitigations  

## Technical Challenges

### 1. State Synchronization
**Risk**: Frontend and backend states getting out of sync
**Mitigation**: 
- Single source of truth in Redis
- Polling intervals for state verification
- State validation on every API call

### 2. Race Conditions
**Risk**: Concurrent actions causing invalid states
**Mitigation**:
- Atomic Redis operations
- Pessimistic locking for critical sections
- Comprehensive transaction rollback

### 3. Scalability
**Risk**: System performance degrading with more users
**Mitigation**:
- Redis clustering for horizontal scaling
- Efficient queue algorithms
- Connection pooling and optimization

## User Experience Risks

### 1. Increased Wait Times
**Risk**: Simpler matching might increase queue times
**Mitigation**:
- Monitor queue lengths
- Implement smart matching as future enhancement
- Show estimated wait times

### 2. Skip Abuse
**Risk**: Users rapidly skipping through matches
**Mitigation**:
- Cooldown periods between skips
- Rate limiting on skip actions
- Future: reputation system

## MVP Considerations

### Minimum Viable Features
1. Working state machine with all states
2. Skip puts both users back in queue
3. End differentiates user outcomes
4. No users alone in rooms
5. Basic cooldown to prevent re-matching

### Future Enhancements
- Smart matching based on skip patterns
- User preferences and filters
- Report/block functionality
- Session history and analytics
- Mobile app support

# Appendix  

## Current Implementation Analysis

### Strengths
- Robust disconnect detection with multiple flags
- Good handling of concurrent operations  
- Efficient Redis usage
- Clean separation of concerns

### Weaknesses  
- Over-complex skip logic with immediate re-matching
- No true IDLE state
- Inconsistent end button behavior
- State transitions not explicit enough

## Performance Benchmarks

### Target Metrics
- State transition: < 100ms
- Disconnect detection: < 500ms  
- Queue to match: < 5 seconds average
- Room creation: < 1 second
- Concurrent users: 10,000+

## Security Considerations
- No user authentication required (anonymous)
- Rate limiting on all endpoints
- Input validation for all user IDs
- Secure random ID generation
- No PII storage
</PRD>