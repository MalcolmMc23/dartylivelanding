Overview
We'll build a backend service that handles user matching, queue management, and LiveKit room creation. This will replace the mock service currently in src/app/video-chat/services/matchingService.ts.
Architecture Approach
Based on your existing Next.js setup, we'll implement the backend using Next.js API Routes rather than a separate backend service. This keeps everything in one codebase and simplifies deployment.
Step 1: Database Setup & Models
Update Database Schema
Modify schema.sql to align with the Matching.md architecture:
Apply to dbSetup.md
;
Create Database Connection Pool
src/lib/db.ts:
Apply to dbSetup.md
;
Step 2: Redis Setup for Queue Management
Create Redis Client
src/lib/redis.ts:
Apply to dbSetup.md
;
Queue Manager
src/lib/queueManager.ts:
Apply to dbSetup.md
}
Step 3: LiveKit Integration
LiveKit Service
src/lib/livekitService.ts:
Apply to dbSetup.md
}
Step 4: Core Matching Service
Matching Logic
src/lib/matchingService.ts:
Apply to dbSetup.md
}
Step 5: API Routes Implementation
POST /api/matching/enqueue
src/app/api/matching/enqueue/route.ts
Adds user to queue, attempts immediate match
Returns session data if matched, or queue position if waiting
POST /api/matching/skip
src/app/api/matching/skip/route.ts
Ends current session, re-enqueues user
Returns new session data if immediately matched
POST /api/matching/end
src/app/api/matching/end/route.ts
Ends session cleanly, removes from queue
GET /api/matching/status
src/app/api/matching/status/route.ts
Returns queue position and estimated wait time
POST /api/webhook/livekit
src/app/api/webhook/livekit/route.ts
Handles LiveKit webhooks for unexpected disconnections
Step 6: Background Services
Queue Processor
src/lib/workers/queueProcessor.ts:
Apply to dbSetup.md
}
Session Cleanup
src/lib/workers/sessionCleanup.ts:
Apply to dbSetup.md
}
Step 7: State Management & Synchronization
User State Manager
src/lib/userStateManager.ts:
Apply to dbSetup.md
}
Session State Sync
Use Redis pub/sub for real-time state updates
Implement heartbeat mechanism for connection monitoring
Step 8: Security & Rate Limiting
Rate Limiter
src/lib/rateLimiter.ts:
Apply to dbSetup.md
}
Authentication Middleware
src/lib/middleware/auth.ts
Verify user tokens
Ensure users can only modify their own sessions
Step 9: Environment Configuration
Update .env.local:
Apply to dbSetup.md
Run
100
Step 10: Testing & Deployment
Unit Tests
Test queue operations
Test matching logic
Test session management
Integration Tests
Test full user flow
Test concurrent user scenarios
Test error cases
Load Testing
Test with multiple concurrent users
Test queue performance
Test WebSocket connections
Implementation Order
Week 1: Database setup, Redis setup, basic API routes
Week 2: LiveKit integration, matching logic, queue management
Week 3: Background services, state synchronization, webhooks
Week 4: Security, rate limiting, testing, deployment prep
Key Considerations
Scalability: Use connection pooling, implement caching, optimize queries
Reliability: Implement retry logic, graceful error handling, logging
Monitoring: Add metrics, health checks, error tracking
User Experience: Implement progress indicators, error messages, reconnection logic
