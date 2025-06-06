"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChatState,
  MatchData,
  SkipCallResponse,
} from "@/types/random-chat";

export function useRandomChat() {
  const [chatState, setChatState] = useState<ChatState>("IDLE");
  const [token, setToken] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [needsRequeue, setNeedsRequeue] = useState(false);
  const userIdRef = useRef<string | null>(null);
  if (userIdRef.current === null && typeof window !== "undefined") {
    userIdRef.current = `user_${Math.random().toString(36).substring(2, 11)}`;
  }
  const userId = userIdRef.current;
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const isEndingCall = useRef(false);
  const isSkipping = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  }, []);

  const handleMatch = useCallback(
    async (matchData: MatchData) => {
      console.log("Handling match:", matchData);
      setChatState("CONNECTING");
      setSessionId(matchData.sessionId);

      try {
        const response = await fetch("/api/livekit-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName: matchData.roomName,
            participantName: userId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to get video token");
        }

        const { token: newToken } = await response.json();
        console.log(
          "Got LiveKit token, connecting to room:",
          matchData.roomName
        );
        setToken(newToken);
        setChatState("IN_CALL");
      } catch (err) {
        console.error("Error getting token:", err);
        setError(
          err instanceof Error ? err.message : "Failed to connect to video"
        );
        setChatState("IDLE");
      }
    },
    [userId]
  );

  const sendHeartbeat = useCallback(async () => {
    if (!userId) {
      console.error("Cannot send heartbeat: userId is null");
      return;
    }
    try {
      console.log("Sending heartbeat for userId:", userId);
      await fetch("/api/simple-matching/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      console.error("Heartbeat error:", err);
    }
  }, [userId]);

  const startHeartbeat = useCallback(() => {
    sendHeartbeat();
    heartbeatInterval.current = setInterval(sendHeartbeat, 10000);
  }, [sendHeartbeat]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    pollingInterval.current = setInterval(async () => {
      try {
        const forceDisconnectResponse = await fetch(
          "/api/simple-matching/check-disconnect",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          }
        );

        const disconnectData = await forceDisconnectResponse.json();
        if (disconnectData.shouldDisconnect) {
          console.log("Force disconnect detected - handling immediately");
          stopPolling();
          setToken("");
          setChatState("WAITING");
          setSessionId("");
          setError("Skipped by other user - finding new match...");
          setNeedsRequeue(true);

          setTimeout(() => {
            setError("");
          }, 3000);

          return;
        }

        const response = await fetch("/api/simple-matching/check-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });

        const data = await response.json();
        console.log("Poll response:", data);

        if (data.matched) {
          console.log("Match found via polling!");
          stopPolling();
          await handleMatch(data.data);
        } else if (!data.inQueue) {
          console.log("Not in queue - checking for match one more time...");

          const finalCheck = await fetch("/api/simple-matching/check-match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });

          const finalData = await finalCheck.json();
          if (finalData.matched) {
            console.log("Found match on final check!");
            stopPolling();
            await handleMatch(finalData.data);
          } else {
            console.log("No match found, stopping");
            stopPolling();
            setError("Failed to find match");
            setChatState("IDLE");
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 500);
  }, [userId, handleMatch, stopPolling]);

  const startMatching = useCallback(async () => {
    if (!userId) {
      console.error("Cannot start matching: userId is null");
      setError("User ID not initialized");
      return;
    }

    console.log("Starting matching with userId:", userId);
    setChatState("WAITING");
    setError("");

    try {
      startHeartbeat();

      const response = await fetch("/api/simple-matching/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();
      console.log("Enqueue response:", data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to start matching");
      }

      if (data.matched) {
        console.log("Immediate match found!");
        await handleMatch(data.data);
      } else {
        console.log("No immediate match, starting polling...");
        startPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start matching");
      setChatState("IDLE");
      stopHeartbeat();
    }
  }, [userId, startHeartbeat, handleMatch, startPolling, stopHeartbeat]);

  const endCall = useCallback(async () => {
    if (isEndingCall.current) {
      console.log("Already ending call, skipping duplicate");
      return;
    }

    isEndingCall.current = true;
    stopPolling();
    stopHeartbeat();

    setToken("");
    setChatState("IDLE");

    const currentSessionId = sessionId;
    if (currentSessionId) {
      try {
        console.log("Ending call for session:", currentSessionId);
        await fetch("/api/simple-matching/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, sessionId: currentSessionId }),
        });
      } catch (err) {
        console.error("Error ending session:", err);
      }
    }

    setSessionId("");

    setTimeout(() => {
      isEndingCall.current = false;
    }, 1000);
  }, [userId, sessionId, stopPolling, stopHeartbeat]);

  const skipCall = useCallback(async () => {
    if (isEndingCall.current || isSkipping.current) {
      console.log("Already ending/skipping call, skipping duplicate");
      return;
    }

    isSkipping.current = true;
    isEndingCall.current = true;
    stopPolling();
    stopHeartbeat();

    const previousToken = token;
    const currentSessionId = sessionId;

    setToken("");
    setChatState("WAITING");

    await new Promise((resolve) => setTimeout(resolve, 200));

    let skipData: SkipCallResponse | null = null;
    if (currentSessionId && previousToken) {
      try {
        console.log("Skipping call for session:", currentSessionId);
        const response = await fetch("/api/simple-matching/skip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, sessionId: currentSessionId }),
        });

        if (response.ok) {
          skipData = await response.json();
          console.log("Skip successful:", skipData);

          if (
            skipData &&
            skipData.matchResults?.skipper?.matched &&
            skipData.matchResults.skipper.matchData
          ) {
            console.log("Skip resulted in immediate match!");
            const matchData = skipData.matchResults.skipper.matchData;
            setSessionId(matchData.sessionId);

            const tokenResponse = await fetch("/api/livekit-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomName: matchData.roomName,
                participantName: userId,
              }),
            });

            if (tokenResponse.ok) {
              const { token: newToken } = await tokenResponse.json();
              setToken(newToken);
              setChatState("IN_CALL");

              setTimeout(() => {
                isEndingCall.current = false;
                isSkipping.current = false;
              }, 100);
              return;
            }
          }
        } else {
          console.error("Skip failed:", await response.text());
        }
      } catch (err) {
        console.error("Error skipping session:", err);
      }
    }

    if (!skipData || !skipData.matchResults?.skipper?.matched) {
      setSessionId("");

      const skipperInQueue = skipData?.queueStatus?.skipperInQueue;
      console.log("[Skip] Skipper in queue after skip:", skipperInQueue);

      if (skipperInQueue) {
        startHeartbeat();
        startPolling();
      } else {
        console.log("[Skip] Not in queue after skip, manually enqueueing");
        startMatching();
      }
    }

    setTimeout(() => {
      isEndingCall.current = false;
      isSkipping.current = false;
    }, 100);
  }, [
    userId,
    sessionId,
    token,
    startPolling,
    startHeartbeat,
    startMatching,
    stopPolling,
  ]);

  const cancelWaiting = async () => {
    stopPolling();
    stopHeartbeat();

    try {
      await fetch("/api/simple-matching/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sessionId: "cancel" }),
      });
    } catch (err) {
      console.error("Error canceling:", err);
    }

    setChatState("IDLE");
    setError("");
  };

  const handleLiveKitDisconnect = useCallback(async () => {
    console.log("LiveKit disconnected");
    if (!isSkipping.current && !isEndingCall.current && chatState === "IN_CALL") {
      console.log("Unexpected disconnection - checking if we were skipped");
      console.log("Current state:", { userId, sessionId, chatState });

      try {
        const response = await fetch("/api/simple-matching/check-disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        
        const data = await response.json();
        if (data.shouldDisconnect) {
          console.log("Confirmed: we were skipped");
          
          const matchResponse = await fetch("/api/simple-matching/check-match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          
          const matchData = await matchResponse.json();
          if (matchData.matched) {
            console.log("Already matched with someone new!");
            await handleMatch(matchData.data);
            return;
          }
          
          setToken("");
          setChatState("WAITING");
          setSessionId("");
          setError("Skipped by other user - finding new match...");
          
          if (matchData.inQueue) {
            console.log("Already in queue, starting polling");
            startHeartbeat();
            startPolling();
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
      endCall();
      setError("");
    }
  }, [chatState, userId, sessionId, handleMatch, startHeartbeat, startPolling, startMatching, endCall]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (chatState !== "IDLE") {
        navigator.sendBeacon(
          "/api/simple-matching/end",
          JSON.stringify({ userId, sessionId: sessionId || "cleanup" })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      stopPolling();
      stopHeartbeat();

      if (chatState === "IN_CALL" && sessionId) {
        console.log("Cleanup on unmount for active call");
        fetch("/api/simple-matching/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, sessionId }),
        }).catch(console.error);
      }
    };
  }, [userId, sessionId, chatState, endCall, stopPolling, stopHeartbeat]);

  useEffect(() => {
    if (needsRequeue && chatState === "WAITING") {
      setNeedsRequeue(false);
      startMatching();
    }
  }, [needsRequeue, chatState, startMatching]);

  useEffect(() => {
    const cleanupInterval = setInterval(async () => {
      try {
        await fetch("/api/simple-matching/cleanup", { method: "POST" });
      } catch (err) {
        console.error("Cleanup error:", err);
      }
    }, 15000);

    return () => clearInterval(cleanupInterval);
  }, []);

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
          const response = await fetch(
            "/api/simple-matching/check-disconnect",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            }
          );

          const data = await response.json();
          if (data.shouldDisconnect) {
            console.log("Force disconnect detected - user was skipped");
            isSkipping.current = true;
            stopPolling();
            stopHeartbeat();
            setToken("");
            setChatState("WAITING");
            setSessionId("");
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
      }, 500);
    }

    return () => {
      if (disconnectCheckInterval) {
        clearInterval(disconnectCheckInterval);
      }
    };
  }, [chatState, userId, token, stopPolling, stopHeartbeat]);

  const onCheckStatus = async () => {
    if (!userId) return;
    const res = await fetch("/api/simple-matching/check-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    console.log("Manual check result:", data);
  };

  const onForceCleanup = async () => {
    if (!userId) return;
    const res = await fetch("/api/simple-matching/force-cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    console.log("Force cleanup result:", data);
    if (data.allClean) {
      setChatState("IDLE");
      setToken("");
      setSessionId("");
    }
  };

  const handleOnConnected = async () => {
    console.log("LiveKit connected successfully!");
    // Clear any lingering force-disconnect flag when successfully connected
    try {
      await fetch("/api/simple-matching/check-disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      console.error("Error clearing disconnect flag:", err);
    }
  };

  return {
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
  };
} 