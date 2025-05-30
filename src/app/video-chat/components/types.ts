export type ChatState = "IDLE" | "WAITING_FOR_MATCH" | "IN_CALL" | "SHOWING_THANKS";

export interface MatchSession {
  sessionId: string;
  roomName: string;
  accessToken: string;
  peerId?: string;
}

export interface MatchingAPIResponse {
  success: boolean;
  data?: MatchSession;
  error?: string;
}

export interface VideoChatLandingProps {
  onStartChat: () => void;
}

export interface MatchingQueueProps {
  onCancel: () => void;
}

export interface VideoCallProps {
  roomName: string;
  accessToken: string;
  sessionId: string;
  onSkip: () => void;
  onEnd: () => void;
  onStateChange: (state: ChatState) => void;
} 