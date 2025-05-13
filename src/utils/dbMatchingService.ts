// NOTE: This file is no longer used as the application has been switched to in-memory storage only.
// It's kept for reference in case database functionality needs to be restored in the future.

// Interface definitions preserved for reference
export interface WaitingUser {
  id: number;
  username: string;
  joined_at: Date;
  use_demo: boolean;
  in_call: boolean;
  room_name?: string;
  last_matched_with?: string;
  last_matched_at?: Date;
}

export interface MatchedPair {
  id: number;
  user1: string;
  user2: string;
  room_name: string;
  use_demo: boolean;
  matched_at: Date;
}

// Dummy implementation that throws an error if called
function throwDisabledError(): never {
  throw new Error('Database matching service has been disabled. Application is using in-memory storage only.');
}

// Disable ESLint rule for unused vars in this file since these are intentional mock functions
/* eslint-disable @typescript-eslint/no-unused-vars */

// Mock implementations that throw errors if called
export async function addUserToQueue(
  _username: string, 
  _useDemo: boolean, 
  _inCall = false, 
  _roomName?: string, 
  _lastMatch?: { matchedWith: string }
): Promise<Record<string, unknown>> {
  throwDisabledError();
}

export async function removeUserFromQueue(_username: string): Promise<boolean> {
  throwDisabledError();
}

export async function findMatchForUser(
  _username: string, 
  _useDemo: boolean, 
  _lastMatchedWith?: string
): Promise<{ status: string }> {
  throwDisabledError();
}

export async function handleUserDisconnection(
  _username: string, 
  _roomName: string, 
  _otherUsername?: string
): Promise<{ status: string }> {
  throwDisabledError();
}

export async function cleanupOldWaitingUsers(): Promise<[]> {
  throwDisabledError();
}

export async function cleanupOldMatches(): Promise<[]> {
  throwDisabledError();
}

export async function getWaitingQueueStatus(_username: string): Promise<{ status: string }> {
  throwDisabledError();
}

/* eslint-enable @typescript-eslint/no-unused-vars */ 