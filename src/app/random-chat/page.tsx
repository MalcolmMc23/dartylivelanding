"use client";

import { useState, useEffect } from "react";
import { VideoConference } from "./components/VideoConference";
import { WaitingRoom } from "./components/WaitingRoom";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { useMatching } from "./hooks/useMatching";
import { useLiveKit } from "./hooks/useLiveKit";
import { useUsername } from "./hooks/useUsername";
import { MatchData } from "./types";
import { createCallHandlers } from "./handlers/callHandlers";
import { createDebugHandlers } from "./handlers/debugHandlers";
import { useCallEffects } from "./hooks/useCallEffects";

export default function RandomChatPage() {
  // Get username from API
  const { username: apiUsername } = useUsername();
  const [username, setUsername] = useState<string>("not found");
  
  // Update username when username is available
  useEffect(() => {
    if (apiUsername) {
      console.log('Setting username to:', apiUsername);
      setUsername(apiUsername);
    }
  }, [apiUsername]);

  // Initialize hooks
  const { startHeartbeat, stopHeartbeat } = useHeartbeat(username);
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
  } = useMatching(username, handleMatch, startHeartbeat, stopHeartbeat);

  const { token, sessionId, setSessionId, connectToRoom, disconnectFromRoom } =
    useLiveKit(username, setError);

  // Handle successful match
  async function handleMatch(matchData: MatchData) {
    console.log("Handling match:", matchData);
    if (!matchData.sessionId || !matchData.roomName) {
      console.error("Invalid match data:", matchData);
      setError("Failed to establish connection");
      setChatState("IDLE");
      return;
    }
    
    setChatState("CONNECTING");
    setSessionId(matchData.sessionId);

    try {
      const success = await connectToRoom(matchData.roomName);
      if (success) {
        setChatState("IN_CALL");
      } else {
        setError("Failed to connect to video room");
        setChatState("IDLE");
      }
    } catch (err) {
      console.error("Error connecting to room:", err);
      setError("Failed to connect to video room");
      setChatState("IDLE");
    }
  }

  // Initialize handlers
  const { skipCall, endCall, handleLiveKitDisconnect } = createCallHandlers({
    userId: username,
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
    userId: username,
    setChatState,
    setSessionId,
  });

  // Use effects
  useCallEffects({
    userId: username,
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
    disconnectFromRoom,
  });

  // Render based on state
  if (chatState === "IN_CALL" && token) {
    return (
      <VideoConference
        onSkip={skipCall}
        onEnd={endCall}
        token={token}
        sessionId={sessionId}
        username={username}
        onDisconnected={() => handleLiveKitDisconnect(chatState, handleMatch)}
        onAlone={() => handleLiveKitDisconnect(chatState, handleMatch)}
      />
    );
  }

  return (
    <WaitingRoom
      chatState={chatState}
      error={error}
      username={username}
      onStart={startMatching}
      onCancel={cancelWaiting}
      onCheckStatus={handleCheckStatus}
      onForceCleanup={handleForceCleanup}
    />
  );
}
