# Queue Rating System Implementation

## Overview

A comprehensive rating system has been implemented to prioritize users in the queue based on their "skip time" - how quickly they tend to get skipped or skip others during calls. Users who provide longer, more engaging interactions get higher priority in matching.

## Core Components Implemented

### 1. Skip Statistics Tracking (`src/utils/redis/skipStatsManager.ts`)

- **`updateUserSkipStats()`**: Records skip events and calculates running averages
- **`getUserSkipStats()`**: Retrieves user's historical skip performance
- **Metrics tracked**:
  - Total interaction time across all skips
  - Total number of skips involved
  - Average skip time (calculated automatically)

### 2. Enhanced Queue Data Structure (`src/utils/redis/types.ts`)

- **`UserDataInQueue` interface**: Extended to include skip statistics
  - `averageSkipTime`: Average call duration before skips occur
  - `skipCount`: Number of times user has been involved in skips
- **`calculateQueueScore()` function**: Priority scoring algorithm
  - Lower scores = higher priority
  - In-call users get automatic priority (offset of 0)
  - Waiting users get base offset of 1,000,000,000
  - Skip penalty applied for users with poor interaction history

### 3. Priority-Based Queue Management (`src/utils/redis/queueManager.ts`)

- **Score-based Redis sorted sets**: Users ordered by calculated priority scores
- **Automatic stats fetching**: Skip statistics retrieved when adding users to queue
- **Position calculation**: Reflects actual priority ordering, not just join time
- **State-aware queuing**: In-call and waiting users handled separately but prioritized correctly

### 4. Intelligent Matching Service (`src/utils/redis/matchingService.ts`)

- **Priority-based matching**: Processes users in score order (fixed manual sorting issue)
- **Skip scenario optimization**: Shorter cooldowns for users who were skipped
- **Detailed logging**: Shows skip stats when making matches
- **Preserves priority ordering**: No longer overrides score-based order with join time

### 5. Skip Event Integration (`src/utils/redis/disconnectionHandler.ts`)

- **Automatic stat updates**: Every disconnect/skip updates both users' statistics
- **Duration calculation**: Measures actual call time for accurate skip time tracking
- **Left-behind user priority**: Users who get skipped receive immediate high priority
- **Cooldown clearing**: Removes matching restrictions for skipped users

### 6. API Integration

- **Enhanced match responses**: Include skip statistics in queue status
- **Skip-aware matching**: `/api/match-user` considers user's skip history
- **Real-time updates**: Queue positions reflect actual priority, not just chronological order

## Rating Algorithm Details

### Priority Calculation

```typescript
score = joinedAt + priorityOffset + skipPenalty;
```

- **Priority Offset**:

  - In-call users: 0 (highest priority)
  - Waiting users: 1,000,000,000 (lower priority)

- **Skip Penalty**:
  - Only applied if user has ≥3 skips
  - Based on ratio of average skip time to reference time (2 minutes)
  - Maximum penalty: 5 minutes (300,000ms)
  - Formula: `maxPenalty × (1 - avgSkipTime/referenceTime)`

### Examples

- **New user**: No penalty, standard priority based on join time
- **Good user** (90s avg): Low/no penalty, higher priority
- **Poor user** (15s avg): High penalty, lower priority
- **In-call user**: Always highest priority regardless of skip stats

## Key Features

### ✅ **Smart Prioritization**

- Users with longer interaction times get matched faster
- Users who get skipped frequently receive priority treatment
- New users start with neutral priority

### ✅ **Skip Scenario Optimization**

- In-call users (recently skipped) get immediate priority
- Reduced cooldowns for skip scenarios (1-2 seconds vs 5 seconds)
- Left-behind users can bypass normal cooldown restrictions

### ✅ **Robust Data Tracking**

- Persistent skip statistics stored in Redis
- Automatic calculation of running averages
- Graceful handling of invalid or missing data

### ✅ **Real-time Queue Management**

- Score-based ordering ensures consistent priority
- Queue positions reflect actual matching priority
- Automatic cleanup of stale queue entries

### ✅ **Backward Compatibility**

- Maintains support for legacy queue systems during transition
- Graceful degradation when skip data is unavailable
- Non-breaking changes to existing API endpoints

## Usage Impact

### For Users

1. **Better matches**: Users with good interaction history get faster matches
2. **Fair treatment**: Users who get skipped unfairly receive priority
3. **Quality incentive**: Longer, more engaging interactions are rewarded

### For System

1. **Reduced skip rates**: Better matches lead to fewer skips overall
2. **Improved user retention**: Fair queuing system keeps users engaged
3. **Self-correcting**: Poor behavior naturally results in lower priority

## Files Modified/Created

### Core Implementation

- `src/utils/redis/skipStatsManager.ts` - Skip statistics tracking
- `src/utils/redis/types.ts` - Enhanced data structures and scoring
- `src/utils/redis/queueManager.ts` - Priority-based queue management
- `src/utils/redis/matchingService.ts` - Score-aware matching logic
- `src/utils/redis/disconnectionHandler.ts` - Skip event integration

### Supporting Files

- `src/app/api/match-user/route.ts` - API integration
- `src/app/api/user-disconnect/route.ts` - Disconnect handling
- Various components updated for skip stat display

### Testing

- `scripts/test-rating-system.js` - Basic functionality verification

## Configuration

### Tunable Parameters

- **Minimum skip count threshold**: 3 (before penalties apply)
- **Reference interaction time**: 2 minutes (ideal call length)
- **Maximum skip penalty**: 5 minutes (worst-case priority delay)
- **Cooldown periods**: 1-2 seconds for skip scenarios, 2 seconds normal

### Redis Keys

- `userSkipStats:{username}` - Individual user statistics
- `matching:queue` - Unified priority queue
- `recentMatch:{user1}:{user2}` - Cooldown tracking

## Monitoring & Debugging

### Logging

- Detailed logs for skip stat updates
- Priority score calculations logged for each queue addition
- Match decisions include skip statistics
- Queue position calculations show priority-based ordering

### Debug Information

- Skip statistics included in queue status responses
- Priority scores visible in admin interfaces
- Queue positions reflect actual matching order

## Future Enhancements

### Potential Improvements

1. **Advanced metrics**: Track skip reasons, interaction quality
2. **Machine learning**: Predict compatibility based on interaction patterns
3. **Dynamic thresholds**: Adjust penalty parameters based on system performance
4. **A/B testing**: Compare different scoring algorithms
5. **User feedback**: Allow users to rate interaction quality

### Scalability Considerations

- Redis sorted sets handle millions of users efficiently
- Skip statistics use minimal storage (one JSON object per user)
- Automatic cleanup prevents memory leaks
- Horizontal scaling possible with Redis clustering

## Conclusion

The rating system successfully implements a fair, efficient queuing mechanism that:

- Rewards users who provide good interactions
- Prioritizes users who get skipped unfairly
- Maintains system performance and reliability
- Provides transparent, predictable behavior

The implementation is production-ready with comprehensive error handling, backward compatibility, and monitoring capabilities.
