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
}

export interface ActiveMatch {
  user1: string;
  user2: string;
  roomName: string;
  useDemo: boolean;
  matchedAt: number;
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
export function calculateQueueScore(state: UserQueueState, joinedAt: number): number {
  // In-call users get higher priority (lower score)
  const priorityOffset = state === 'in_call' ? 0 : 1000000000;
  return joinedAt + priorityOffset;
} 