"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Video, Users, AlertCircle } from "lucide-react";
import { Track } from "livekit-client";
import { CustomControlBar } from "@/components/CustomControlBar";

type ChatState = "IDLE" | "WAITING" | "CONNECTING" | "IN_CALL";

interface MatchData {
  sessionId: string;
  roomName: string;
  peerId?: string;
}

interface SkipMatchData {
  sessionId: string;
  roomName: string;
  peerId?: string;
}

interface SkipCallMatchResult {
  matched: boolean;
  matchData?: SkipMatchData;
}

interface SkipCallResponse {
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

interface CustomVideoConferenceProps {
  onSkip: () => void;
  onEnd: () => void;
}

function CustomVideoConference({ onSkip, onEnd }: CustomVideoConferenceProps) {
  const room = useRoomContext();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const handleSkip = useCallback(() => {
    // Disconnect from LiveKit room first
    if (room) {
      room.disconnect();
    }
    onSkip();
  }, [room, onSkip]);

  const handleEnd = useCallback(() => {
    // Disconnect from LiveKit room first
    if (room) {
      room.disconnect();
    }
    onEnd();
  }, [room, onEnd]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <GridLayout tracks={tracks} style={{ height: "calc(100vh - 80px)" }}>
        <ParticipantTile />
      </GridLayout>
      <CustomControlBar
        onChatClick={() => {}}
        hasUnreadChat={false}
        onSkip={handleSkip}
        onEnd={handleEnd}
      />
      <RoomAudioRenderer />
    </div>
  );
}

export default function RandomChatPage() {
  const [chatState, setChatState] = useState<ChatState>("IDLE");
  const [token, setToken] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [error, setError] = useState<string>("");
  const userIdRef = useRef<string | null>(null);
  if (userIdRef.current === null && typeof window !== "undefined") {
    userIdRef.current = `user_${Math.random().toString(36).substring(2, 11)}`;
  }
  const userId = userIdRef.current;
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const isEndingCall = useRef(false);
  const isSkipping = useRef(false);

  // Send heartbeat
  const sendHeartbeat = async () => {
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
  };

  // Start heartbeat
  const startHeartbeat = useCallback(() => {
    sendHeartbeat(); // Send immediately
    heartbeatInterval.current = setInterval(sendHeartbeat, 10000); // Every 10 seconds
  }, [sendHeartbeat]);

  // Stop heartbeat
  const stopHeartbeat = () => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  };

  // Start matching
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
      // Start heartbeat when entering queue
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
        // Immediate match found
        console.log("Immediate match found!");
        await handleMatch(data.data);
      } else {
        // Start polling for match
        console.log("No immediate match, starting polling...");
        startPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start matching");
      setChatState("IDLE");
      stopHeartbeat();
    }
  }, [userId]);

  // Handle successful match
  const handleMatch = useCallback(
    async (matchData: MatchData) => {
      console.log("Handling match:", matchData);
      setChatState("CONNECTING");
      setSessionId(matchData.sessionId);

      try {
        // Get LiveKit token
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

        const { token } = await response.json();
        console.log(
          "Got LiveKit token, connecting to room:",
          matchData.roomName
        );
        setToken(token);
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

  // Poll for match
  const startPolling = useCallback(() => {
    pollingInterval.current = setInterval(async () => {
      try {
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
          // No longer in queue - but don't stop immediately, could be transitioning
          console.log("Not in queue - checking for match one more time...");

          // Do one final check for match data
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
            // Really not matched, stop
            console.log("No match found, stopping");
            stopPolling();
            setError("Failed to find match");
            setChatState("IDLE");
          }
        }

        // Check if we should force disconnect
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
          stopPolling();
          setToken("");
          setChatState("IDLE");
          setError("Call ended by other user");
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000); // Poll every 2 seconds
  }, [userId, handleMatch]);

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  // End call
  const endCall = useCallback(async () => {
    if (isEndingCall.current) {
      console.log("Already ending call, skipping duplicate");
      return;
    }

    isEndingCall.current = true;
    stopPolling();
    stopHeartbeat();

    const currentSessionId = sessionId;
    if (currentSessionId && chatState === "IN_CALL") {
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

    setToken("");
    setSessionId("");
    setChatState("IDLE");

    // Reset the flag after a delay
    setTimeout(() => {
      isEndingCall.current = false;
    }, 1000);
  }, [userId, sessionId, chatState]);

  // Skip to next user
  const skipCall = useCallback(async () => {
    if (isEndingCall.current || isSkipping.current) {
      console.log("Already ending/skipping call, skipping duplicate");
      return;
    }

    isSkipping.current = true;
    isEndingCall.current = true;
    stopPolling();
    stopHeartbeat();

    let skipData: SkipCallResponse | null = null;
    const currentSessionId = sessionId;
    if (currentSessionId && chatState === "IN_CALL") {
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

          // Check if skipper was immediately matched
          if (
            skipData &&
            skipData.matchResults?.skipper?.matched &&
            skipData.matchResults.skipper.matchData
          ) {
            console.log("Skip resulted in immediate match!");
            const matchData = skipData.matchResults.skipper.matchData;
            setSessionId(matchData.sessionId);

            // Generate token for the new room
            const tokenResponse = await fetch("/api/livekit-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomName: matchData.roomName,
                participantName: userId,
              }),
            });

            if (tokenResponse.ok) {
              const { token } = await tokenResponse.json();
              setToken(token);
              setChatState("IN_CALL");
              // Don't start polling - we're already matched

              // Reset the flags after a short delay
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

    // If we didn't get an immediate match, go to waiting state
    if (!skipData || !skipData.matchResults?.skipper?.matched) {
      // Clear the current call state - this will trigger LiveKit disconnection
      setToken("");
      setSessionId("");
      setChatState("WAITING");

      // Check if we're actually in the queue
      const skipperInQueue = skipData?.queueStatus?.skipperInQueue;
      console.log("[Skip] Skipper in queue after skip:", skipperInQueue);
      
      if (skipperInQueue) {
        // We're already re-queued on backend, start polling
        startHeartbeat();
        startPolling();
      } else {
        // Not in queue, need to manually enqueue
        console.log("[Skip] Not in queue after skip, manually enqueueing");
        startMatching();
      }
    }

    // Reset the flags after a short delay
    setTimeout(() => {
      isEndingCall.current = false;
      isSkipping.current = false;
    }, 100);
  }, [userId, sessionId, chatState, startPolling, startHeartbeat, startMatching]);

  // Cancel waiting
  const cancelWaiting = async () => {
    stopPolling();
    stopHeartbeat();

    // Remove from queue
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

  // Cleanup on unmount
  useEffect(() => {
    // Handle tab close/refresh
    const handleBeforeUnload = () => {
      if (chatState !== "IDLE") {
        // Use sendBeacon for reliable cleanup on tab close
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

      // Cleanup on unmount only if actually in a call
      if (chatState === "IN_CALL" && sessionId) {
        console.log("Cleanup on unmount for active call");
        fetch("/api/simple-matching/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, sessionId }),
        }).catch(console.error);
      }
    };
  }, [userId, sessionId, chatState, endCall]);

  // Periodic cleanup of stale users
  useEffect(() => {
    const cleanupInterval = setInterval(async () => {
      try {
        await fetch("/api/simple-matching/cleanup", { method: "POST" });
      } catch (err) {
        console.error("Cleanup error:", err);
      }
    }, 15000); // Every 15 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  // More frequent force disconnect check when in call
  useEffect(() => {
    let disconnectCheckInterval: NodeJS.Timeout | null = null;

    if (chatState === "IN_CALL") {
      // Check every 2 seconds when in a call
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
            console.log("Force disconnect detected - ending call");
            endCall();
            setError("Skipped by other user");
          }
        } catch (err) {
          console.error("Disconnect check error:", err);
        }
      }, 2000); // Check every 2 seconds
    }

    return () => {
      if (disconnectCheckInterval) {
        clearInterval(disconnectCheckInterval);
      }
    };
  }, [chatState, userId, endCall]);

  // Render based on state
  if (chatState === "IN_CALL" && token) {
    console.log(
      "Rendering LiveKit room with token:",
      token.substring(0, 20) + "..."
    );
    console.log("LiveKit URL:", process.env.NEXT_PUBLIC_LIVEKIT_URL);

    return (
      <div style={{ height: "100vh" }}>
        <div className="absolute top-4 left-4 z-50 bg-black/80 text-white p-2 rounded text-xs">
          <div>State: IN_CALL</div>
          <div>Session: {sessionId}</div>
          <div>User: {userId}</div>
        </div>
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
          data-lk-theme="default"
          style={{ height: "100%" }}
          onDisconnected={() => {
            console.log("LiveKit disconnected");
            // Only call endCall if we're not already skipping
            if (!isSkipping.current) {
              endCall();
              setError("");
            }
          }}
          onError={(error) => {
            console.error("LiveKit error:", error);
            setError("Connection error occurred");
          }}
          onConnected={() => {
            console.log("LiveKit connected successfully!");
          }}
          connect={true}
          connectOptions={{
            autoSubscribe: true,
            maxRetries: 0,
            peerConnectionTimeout: 10000,
          }}
        >
          <CustomVideoConference onSkip={skipCall} onEnd={endCall} />
          <style jsx global>{`
            .lk-disconnect-button {
              display: none !important;
            }
          `}</style>
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
      <Card className="p-8 bg-gray-900/80 border-gray-700 max-w-md w-full">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            {chatState === "WAITING" || chatState === "CONNECTING" ? (
              <Users className="h-16 w-16 text-yellow-500 animate-pulse" />
            ) : (
              <Video className="h-16 w-16 text-blue-500" />
            )}
          </div>

          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {chatState === "IDLE" && "Random Video Chat"}
              {chatState === "WAITING" && "Finding someone..."}
              {chatState === "CONNECTING" && "Connecting..."}
            </h1>
            <p className="text-gray-300">
              {chatState === "IDLE" && "Connect with random people instantly"}
              {chatState === "WAITING" &&
                "Please wait while we find someone to chat with"}
              {chatState === "CONNECTING" && "Setting up your video connection"}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {userId ? `Your ID: ${userId}` : "Loading ID..."}
            </p>
          </div>

          {/* Debug buttons */}
          <div className="flex gap-2 justify-center">
            <button
              onClick={async () => {
                if (!userId) return;
                const res = await fetch("/api/simple-matching/check-match", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId }),
                });
                const data = await res.json();
                console.log("Manual check result:", data);
              }}
              className="text-xs text-gray-400 underline"
            >
              Check Status
            </button>
            <button
              onClick={async () => {
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
              }}
              className="text-xs text-gray-400 underline"
            >
              Force Cleanup
            </button>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-3">
              <div className="flex items-center space-x-2 text-red-300">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {chatState === "IDLE" && (
            <Button
              onClick={startMatching}
              size="lg"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Start Chat
            </Button>
          )}

          {(chatState === "WAITING" || chatState === "CONNECTING") && (
            <Button
              onClick={cancelWaiting}
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
