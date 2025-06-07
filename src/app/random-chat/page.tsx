"use client";

import { useRef, useEffect, useCallback } from "react";
import { VideoConference } from "./components/VideoConference";
import { WaitingRoom } from "./components/WaitingRoom";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { useMatching } from "./hooks/useMatching";
import { useLiveKit } from "./hooks/useLiveKit";
import { api } from "./utils/api";
import { MatchData } from "./types";

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
    handleLiveKitError,
    handleLiveKitConnected,
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

  // Handle LiveKit disconnection
  const handleLiveKitDisconnect = useCallback(async () => {
    console.log("LiveKit disconnected");
    
    if (!isSkipping.current && !isEndingCall.current && chatState === "IN_CALL") {
      console.log("Unexpected disconnection - checking if we were skipped");
      
      try {
        const data = await api.checkDisconnect(userId);
        if (data.shouldDisconnect) {
          console.log("Confirmed: we were skipped");
          
          const matchData = await api.checkMatch(userId);
          if (matchData.matched) {
            console.log("Already matched with someone new!");
            await handleMatch(matchData.data!);
            return;
          }
          
          setChatState("WAITING");
          setError("Skipped by other user - finding new match...");
          
          if (matchData.inQueue) {
            console.log("Already in queue, starting polling");
            startHeartbeat();
          } else {
            console.log("Not in queue, starting matching");
            setTimeout(() => {
              startMatching();
            }, 500);
          }
          
          setTimeout(() => {
            setError("");
          }, 3000);
          
          return;
        }
      } catch (err) {
        console.error("Error checking disconnect status:", err);
      }
    }
    
    if (!isSkipping.current) {
      await disconnectFromRoom();
      setChatState("IDLE");
      setError("");
    }
  }, [chatState, userId, handleMatch, startHeartbeat, startMatching, disconnectFromRoom]);

  // Handle skip call
  const skipCall = useCallback(async () => {
    if (isEndingCall.current || isSkipping.current) {
      console.log("Already ending/skipping call, skipping duplicate");
      return;
    }

    isSkipping.current = true;
    isEndingCall.current = true;
    stopPolling();
    stopHeartbeat();

    const currentSessionId = sessionId;
    setChatState("WAITING");

    await new Promise((resolve) => setTimeout(resolve, 200));

    if (currentSessionId) {
      try {
        console.log("Skipping call for session:", currentSessionId);
        const skipData = await api.skipCall(userId, currentSessionId);
        console.log("Skip successful:", skipData);

        if (skipData.matchResults?.skipper?.matched && skipData.matchResults.skipper.matchData) {
          console.log("Skip resulted in immediate match!");
          const matchData = skipData.matchResults.skipper.matchData;
          setSessionId(matchData.sessionId);

          const success = await connectToRoom(matchData.roomName);
          if (success) {
            setChatState("IN_CALL");
          }

          setTimeout(() => {
            isEndingCall.current = false;
            isSkipping.current = false;
          }, 100);
          return;
        }

        if (!skipData.queueStatus?.skipperInQueue) {
          console.log("[Skip] Not in queue after skip, manually enqueueing");
          startMatching();
        }
      } catch (err) {
        console.error("Error skipping session:", err);
      }
    }

    setTimeout(() => {
      isEndingCall.current = false;
      isSkipping.current = false;
    }, 100);
  }, [userId, sessionId, connectToRoom, startMatching, stopPolling, stopHeartbeat]);

  // Handle end call
  const endCall = useCallback(async () => {
    if (isEndingCall.current) {
      console.log("Already ending call, skipping duplicate");
      return;
    }

    isEndingCall.current = true;
    stopPolling();
    stopHeartbeat();

    await disconnectFromRoom();
    setChatState("IDLE");

    setTimeout(() => {
      isEndingCall.current = false;
    }, 1000);
  }, [disconnectFromRoom, stopPolling, stopHeartbeat]);

  // Handle re-queuing when force disconnected
  useEffect(() => {
    if (needsRequeue && chatState === "WAITING") {
      setNeedsRequeue(false);
      startMatching();
    }
  }, [needsRequeue, chatState, startMatching]);

  // Periodic cleanup of stale users
  useEffect(() => {
    const cleanupInterval = setInterval(async () => {
      try {
        await api.cleanup();
      } catch (err) {
        console.error("Cleanup error:", err);
      }
    }, 15000);

    return () => clearInterval(cleanupInterval);
  }, []);

  // More frequent force disconnect check when in call
  useEffect(() => {
    let disconnectCheckInterval: NodeJS.Timeout | null = null;

    if (chatState === "IN_CALL") {
      if (!token) {
        console.log("In call state but no token - recovering");
        setChatState("IDLE");
        setSessionId("");
        return;
      }
      
      disconnectCheckInterval = setInterval(async () => {
        try {
          const data = await api.checkDisconnect(userId);
          if (data.shouldDisconnect) {
            console.log("Force disconnect detected - user was skipped");
            isSkipping.current = true;
            stopPolling();
            stopHeartbeat();
            setChatState("WAITING");
            setError("Skipped by other user - finding new match...");
            
            setTimeout(() => {
              isSkipping.current = false;
              setNeedsRequeue(true);
            }, 500);
            
            setTimeout(() => {
              setError("");
            }, 3000);
          }
        } catch (err) {
          console.error("Disconnect check error:", err);
        }
      }, 2000);
    }

    return () => {
      if (disconnectCheckInterval) {
        clearInterval(disconnectCheckInterval);
      }
    };
  }, [chatState, userId, token, stopPolling, stopHeartbeat]);

  // Handle debug actions
  const handleCheckStatus = async () => {
    if (!userId) return;
    const data = await api.checkMatch(userId);
    console.log("Manual check result:", data);
  };

  const handleForceCleanup = async () => {
    if (!userId) return;
    const data = await api.forceCleanup(userId);
    console.log("Force cleanup result:", data);
    if (data.allClean) {
      setChatState("IDLE");
      setSessionId("");
    }
  };

  // Render based on state
  if (chatState === "IN_CALL" && token) {
    return (
      <VideoConference
        onSkip={skipCall}
        onEnd={endCall}
        token={token}
        sessionId={sessionId}
        userId={userId}
        onDisconnected={handleLiveKitDisconnect}
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
