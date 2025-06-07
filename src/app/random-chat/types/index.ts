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

export interface SkipMatchResult {
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
    skipper?: SkipMatchResult;
    other?: SkipMatchResult;
  };
  queueStatus?: {
    skipperInQueue: boolean;
    otherInQueue: boolean;
  };
}

export interface VideoConferenceProps {
  onSkip: () => void;
  onEnd: () => void;
  token: string;
  sessionId: string;
  userId: string;
  onDisconnected: () => void;
} 