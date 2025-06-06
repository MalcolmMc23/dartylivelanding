export type ChatState = "IDLE" | "WAITING" | "CONNECTING" | "IN_CALL";

export interface MatchData {
  sessionId: string;
  roomName: string;
  peerId?: string;
}

export interface SkipMatchData {
  sessionId: string;
  roomName: string;
  peerId?: string;
}

export interface SkipCallMatchResult {
  matched: boolean;
  matchData?: SkipMatchData;
}

export interface SkipCallResponse {
  success: boolean;
  message: string;
  cleanup: {
    userId: string;
    otherUserId: string | null;
    roomDeleted: boolean;
  };
  matchResults: {
    skipper?: SkipCallMatchResult;
    other?: SkipCallMatchResult;
  };
  queueStatus?: {
    skipperInQueue: boolean;
    otherInQueue: boolean;
  };
} 