/**
 * Types for the improved matching system
 */

export type UserQueueState = 'waiting' | 'in_call';

export interface UserDataInQueue {
  username: string;
  useDemo: boolean;
  state: UserQueueState; // 'waiting' or 'in_call'
  roomName?: string;   // Relevant if state is 'in_call'
  joinedAt: number;     // Timestamp for joining the queue (actual time)
  score?: number;       // Score used for Redis sorted set (can include priority)
  lastMatch?: {
    matchedWith: string;
    timestamp: number; // Timestamp of when this last match occurred
  };
  averageSkipTime?: number; // Average time in a call before a skip occurs (either by this user or to this user)
  skipCount?: number; // Number of times this user has been involved in a skip
}

export interface ActiveMatch {
  user1: string;
  user2: string;
  roomName: string;
  useDemo: boolean;
  matchedAt: number;
}

export interface PendingMatch {
  user1: string;
  user2: string;
  roomName: string;
  useDemo: boolean;
  createdAt?: number;
}

// Match result types for API responses
export type MatchResult = MatchedResult | WaitingResult | ErrorResult;

export interface MatchedResult {
  status: 'matched';
  roomName: string;
  matchedWith: string;
  useDemo: boolean;
}

export interface WaitingResult {
  status: 'waiting';
  error?: undefined;
}

export interface ErrorResult {
  status: 'error';
  error: string;
}

// Helper function to calculate queue score
// Lower scores = higher priority (processed first)
export function calculateQueueScore(
  state: UserQueueState,
  joinedAt: number,
  averageSkipTime?: number, // Added optional parameter
  skipCount?: number      // Added optional parameter
): number {
  // Base priority: In-call users get higher priority (lower score)
  const priorityOffset = state === 'in_call' ? 0 : 1000000000; // Large offset for waiting users

  // JoinedAt forms the base of the score for chronological ordering
  let score = joinedAt + priorityOffset;

  const MIN_SKIP_COUNT_THRESHOLD = 3; // User must have been involved in at least this many skips for penalty to apply
  const MAX_SKIP_TIME_PENALTY = 300000; // Max penalty in milliseconds (e.g., 5 minutes)
  const REFERENCE_MAX_INTERACTION_TIME = 120000; // 2 minutes, an arbitrary "good" interaction length for penalty calculation

  if (
    averageSkipTime !== undefined &&
    averageSkipTime > 0 &&
    skipCount !== undefined &&
    skipCount >= MIN_SKIP_COUNT_THRESHOLD
  ) {
    // Penalty is higher for lower averageSkipTime (user gets skipped faster).
    // Clamp averageSkipTime to avoid issues if it's unexpectedly large or for calculation simplicity.
    const clampedAvgSkipTime = Math.min(averageSkipTime, REFERENCE_MAX_INTERACTION_TIME);

    // Penalty calculation: (1 - ratio_of_current_to_reference_time) * max_penalty
    // If clampedAvgSkipTime is low, ratio is low, (1-ratio) is high -> high penalty.
    // If clampedAvgSkipTime is high (good), ratio is high, (1-ratio) is low -> low penalty.
    let skipPenalty = MAX_SKIP_TIME_PENALTY * (1 - (clampedAvgSkipTime / REFERENCE_MAX_INTERACTION_TIME));

    // Ensure penalty is not negative and not more than MAX_SKIP_TIME_PENALTY.
    skipPenalty = Math.max(0, Math.min(skipPenalty, MAX_SKIP_TIME_PENALTY));
    
    score += skipPenalty;
    console.log(`User ${state === 'in_call' ? 'in_call' : 'waiting'}: Applied skip penalty. Score: ${score}, Penalty: ${skipPenalty}, AvgSkipTime: ${averageSkipTime}, SkipCount: ${skipCount}`);
  } else {
    // No penalty if not enough skip data or if averageSkipTime is 0 (or undefined).
    console.log(`User ${state === 'in_call' ? 'in_call' : 'waiting'}: No skip penalty applied. AvgSkipTime: ${averageSkipTime}, SkipCount: ${skipCount}`);
  }

  return score;
} 