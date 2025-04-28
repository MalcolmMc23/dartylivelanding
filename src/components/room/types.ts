// Define interface for debug info
export interface DebugInfo {
  room: string;
  username: string;
  apiKeyDefined: boolean;
  secretDefined: boolean;
  tokenGenerated: boolean;
  usingDemo?: boolean;
  currentParticipants?: string[];
} 