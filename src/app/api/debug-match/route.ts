import { NextRequest, NextResponse } from 'next/server';
import { matchingState, cleanupOldWaitingUsers, cleanupOldMatches, WaitingUser, MatchedPair } from '@/utils/matchingService';

// Define types for the response
interface WaitingUserInfo {
  username: string;
  joinedAt: number;
  waitTime: string;
  inCall: boolean;
  roomName: string | null;
}

interface MatchInfo {
  user1: string;
  user2: string;
  roomName: string;
  matchedAt: number;
  matchDuration: string;
}

interface WaitingUsersSection {
  count: number;
  usersInCalls: number;
  users: WaitingUserInfo[];
}

interface MatchedUsersSection {
  count: number;
  matches: MatchInfo[];
}

interface UserInfoSection {
  username: string;
  isWaiting: boolean;
  isMatched: boolean;
  waitingDetails: WaitingUserInfo | null;
  matchDetails: MatchInfo | null;
}

interface DebugResponse {
  timestamp: string;
  waitingUsers: WaitingUsersSection;
  matchedUsers: MatchedUsersSection;
  userInfo?: UserInfoSection;
}

// Helper function to convert WaitingUser to WaitingUserInfo
function formatWaitingUser(user: WaitingUser | null): WaitingUserInfo | null {
  if (!user) return null;
  
  return {
    username: user.username,
    joinedAt: user.joinedAt,
    waitTime: `${Math.floor((Date.now() - user.joinedAt) / 1000)} seconds`,
    inCall: user.inCall || false,
    roomName: user.roomName || null
  };
}

// Helper function to convert MatchedPair to MatchInfo
function formatMatchedPair(match: MatchedPair | null): MatchInfo | null {
  if (!match) return null;
  
  return {
    user1: match.user1,
    user2: match.user2,
    roomName: match.roomName,
    matchedAt: match.matchedAt,
    matchDuration: `${Math.floor((Date.now() - match.matchedAt) / 1000)} seconds`
  };
}

// Endpoint to check the current state of the matching system
// For debugging purposes only - would be disabled in production
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clean = searchParams.get('clean') === 'true';
    const username = searchParams.get('username');
    
    // Clean up stale entries if requested
    if (clean) {
      cleanupOldWaitingUsers();
      cleanupOldMatches();
    }
    
    // Build response
    const response: DebugResponse = {
      timestamp: new Date().toISOString(),
      waitingUsers: {
        count: matchingState.waitingUsers.length,
        usersInCalls: matchingState.waitingUsers.filter(u => u.inCall).length,
        users: matchingState.waitingUsers.map(u => ({
          username: u.username,
          joinedAt: u.joinedAt,
          waitTime: `${Math.floor((Date.now() - u.joinedAt) / 1000)} seconds`,
          inCall: u.inCall || false,
          roomName: u.roomName || null
        }))
      },
      matchedUsers: {
        count: matchingState.matchedUsers.length,
        matches: matchingState.matchedUsers.map(m => ({
          user1: m.user1,
          user2: m.user2,
          roomName: m.roomName,
          matchedAt: m.matchedAt,
          matchDuration: `${Math.floor((Date.now() - m.matchedAt) / 1000)} seconds`
        }))
      }
    };
    
    // If username specified, add info about this user
    if (username) {
      const waitingUser = matchingState.waitingUsers.find(u => u.username === username);
      const matchedAsUser1 = matchingState.matchedUsers.find(m => m.user1 === username);
      const matchedAsUser2 = matchingState.matchedUsers.find(m => m.user2 === username);
      
      response.userInfo = {
        username,
        isWaiting: !!waitingUser,
        isMatched: !!(matchedAsUser1 || matchedAsUser2),
        waitingDetails: formatWaitingUser(waitingUser || null),
        matchDetails: formatMatchedPair(matchedAsUser1 || matchedAsUser2 || null)
      };
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in debug-match API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 