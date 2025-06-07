"use client";

import { useRef } from "react";
import { VideoConference } from "./components/VideoConference";
import { WaitingRoom } from "./components/WaitingRoom";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { useMatching } from "./hooks/useMatching";
import { useLiveKit } from "./hooks/useLiveKit";
import { MatchData } from "./types";
import { createCallHandlers } from "./handlers/callHandlers";
import { createDebugHandlers } from "./handlers/debugHandlers";
import { useCallEffects } from "./hooks/useCallEffects";

export default function RandomChatPage() {
  // Generate stable user ID
  const userIdRef = useRef<string | null>(null);
  if (userIdRef.current === null && typeof window !== "undefined") {
    userIdRef.current = `user_${Math.random().toString(36).substring(2, 11)}`;
  }
  const userId = userIdRef.current!;

  // Initialize hooks
  const { startHeartbeat, stopHeartbeat } = useHeartbeat(userId);
  const {
    chatState,
    setChatState,
    error,
    setError,
    needsRequeue,
    setNeedsRequeue,
    isEndingCall,
    isSkipping,
    startMatching,
    cancelWaiting,
    stopPolling,
  } = useMatching(userId, handleMatch, startHeartbeat, stopHeartbeat);

  const {
    token,
    sessionId,
    setSessionId,
    connectToRoom,
    disconnectFromRoom,
  } = useLiveKit(userId, setError);

  // Handle successful match
  async function handleMatch(matchData: MatchData) {
    console.log("Handling match:", matchData);
    setChatState("CONNECTING");
    setSessionId(matchData.sessionId);

    const success = await connectToRoom(matchData.roomName);
    if (success) {
      setChatState("IN_CALL");
    }
  }

  // Initialize handlers
  const { skipCall, endCall, handleLiveKitDisconnect } = createCallHandlers({
    userId,
    sessionId,
    isEndingCall,
    isSkipping,
    stopPolling,
    stopHeartbeat,
    disconnectFromRoom,
    connectToRoom,
    setChatState,
    setSessionId,
    setError,
    startMatching,
  });

  const { handleCheckStatus, handleForceCleanup } = createDebugHandlers({
    userId,
    setChatState,
    setSessionId,
  });

  // Use effects
  useCallEffects({
    userId,
    chatState,
    token,
    needsRequeue,
    isSkipping,
    setChatState,
    setSessionId,
    setError,
    setNeedsRequeue,
    startMatching,
    stopPolling,
    stopHeartbeat,
  });

  // Render based on state
  if (chatState === "IN_CALL" && token) {
    return (
      <VideoConference
        onSkip={skipCall}
        onEnd={endCall}
        token={token}
        sessionId={sessionId}
        userId={userId}
        onDisconnected={() => handleLiveKitDisconnect(chatState, handleMatch)}
      />
    );
  }

  return (
    <WaitingRoom
      chatState={chatState}
      error={error}
      userId={userId}
      onStart={startMatching}
      onCancel={cancelWaiting}
      onCheckStatus={handleCheckStatus}
      onForceCleanup={handleForceCleanup}
    />
  );
}
