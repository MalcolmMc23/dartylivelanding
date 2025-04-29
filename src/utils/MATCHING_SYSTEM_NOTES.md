# Video Chat Matching System Notes

## Recent Changes (Implementation Date: [Current Date])

### 1. User Disconnect Behavior

- **Change**: Both users are now always added back to the waiting queue when either user disconnects, regardless of the disconnect reason
- **Previous Behavior**: Users were only added back to the queue when the disconnect reason was `find_new_match`
- **File Modified**: `src/app/api/user-disconnect/route.ts`

### 2. Rematch Cooldown Period

- **Change**: Reduced the cooldown period from 5 minutes to 10 seconds
- **Previous Behavior**: Users who had just been matched together had to wait 5 minutes before they could be paired again
- **New Behavior**: Users who had just been matched together now only need to wait 10 seconds before they can be paired again
- **File Modified**: `src/app/api/match-user/route.ts`

### 3. Active Matching Implementation (NEW)

- **Change**: Added active matching system to periodically try to match waiting users
- **Previous Behavior**: Users would only be matched when they first joined or when explicitly requesting a match
- **New Behavior**: Users in the waiting queue are now proactively matched through a recurring process
- **Files Added/Modified**:
  - Added `src/app/api/retry-matches/route.ts` - New API endpoint to actively match waiting users
  - Modified `src/components/WaitingRoomComponent.tsx` - Now periodically calls the retry-matches API
  - Modified `src/utils/matchingService.ts` - Added shared REMATCH_COOLDOWN constant

## How the Matching System Works

1. When a user accesses the video chat, they're added to a waiting queue
2. The system attempts to match them with another user in the queue
3. When matched, both users are removed from the queue and added to the matched pairs list
4. When a user disconnects (by leaving call or finding new match):
   - Both users are removed from the matched pairs list
   - Both users are added back to the waiting queue
   - A timestamp and previous match information is stored to prevent immediate re-matching
5. While users are in the waiting queue, the system now actively tries to match them:
   - The WaitingRoomComponent calls the retry-matches API every 3 seconds
   - The retry-matches API attempts to pair waiting users once their cooldown period expires
   - This ensures users are matched more reliably, especially after disconnections

## Technical Implementation

- **Waiting Queue**: In-memory array of users waiting to be matched
- **Matched Pairs**: In-memory array of user pairs who are currently in a video chat
- **Cooldown**: When users disconnect, they won't be re-matched with the same person for 10 seconds
- **Polling**: The client polls the server every 2 seconds to check for matches while in the waiting state
- **Active Matching**: Server-side process to match waiting users once cooldown periods expire
