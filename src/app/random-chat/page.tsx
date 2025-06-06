"use client";

import { useRandomChat } from "@/hooks/useRandomChat";
import { ChatLobby } from "@/components/random-chat/ChatLobby";
import { LiveCall } from "@/components/random-chat/LiveCall";

export default function RandomChatPage() {
  const {
    chatState,
    token,
    sessionId,
    error,
    userId,
    startMatching,
    cancelWaiting,
    skipCall,
    endCall,
    handleLiveKitDisconnect,
    onCheckStatus,
    onForceCleanup,
    setError,
    handleOnConnected,
  } = useRandomChat();

  if (chatState === "IN_CALL" && token) {
    return (
      <LiveCall
        token={token}
        sessionId={sessionId}
        userId={userId}
        onSkip={skipCall}
        onEnd={endCall}
        onDisconnected={handleLiveKitDisconnect}
        onError={(err) => {
          console.error("LiveKit error:", err);
          setError("Connection error occurred");
        }}
        onConnected={handleOnConnected}
      />
    );
  }

  return (
    <ChatLobby
      chatState={chatState}
      userId={userId}
      error={error}
      startMatching={startMatching}
      cancelWaiting={cancelWaiting}
      onCheckStatus={onCheckStatus}
      onForceCleanup={onForceCleanup}
    />
  );
}
