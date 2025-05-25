"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  VideoConference,
  useConnectionState,
  useParticipants,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SimpleVideoRoomProps {
  roomName: string;
  username: string;
  matchedWith: string;
  useDemo?: boolean;
  token: string;
  serverUrl: string;
}

export function SimpleVideoRoom({
  roomName,
  username,
  matchedWith,
  useDemo = false,
  token,
  serverUrl,
}: SimpleVideoRoomProps) {
  const router = useRouter();
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const hasProcessedDisconnection = useRef(false);

  // Track LiveKit connection state
  const connectionState = useConnectionState();
  const participants = useParticipants();

  console.log(
    `SimpleVideoRoom: ${username} in room ${roomName} with ${matchedWith}`
  );
  console.log(
    `Connection state: ${connectionState}, Participants: ${participants.length}`
  );

  // Handle skip button
  const handleSkip = useCallback(async () => {
    if (isProcessingAction) return;

    setIsProcessingAction(true);
    console.log(`${username} clicked SKIP`);

    try {
      const response = await fetch("/api/simple-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "skip",
          username,
          roomName,
          otherUsername: matchedWith,
        }),
      });

      const result = await response.json();
      console.log("Skip result:", result);

      if (result.status === "skipped") {
        // Both users go back to queue, redirect to main page
        router.push(
          `/simple-video?username=${encodeURIComponent(
            username
          )}&autoMatch=true`
        );
      } else {
        console.error("Skip failed:", result);
        setIsProcessingAction(false);
      }
    } catch (error) {
      console.error("Error processing skip:", error);
      setIsProcessingAction(false);
    }
  }, [username, roomName, matchedWith, router, isProcessingAction]);

  // Handle end call button
  const handleEndCall = useCallback(async () => {
    if (isProcessingAction) return;

    setIsProcessingAction(true);
    console.log(`${username} clicked END CALL`);

    try {
      const response = await fetch("/api/simple-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end_call",
          username,
          roomName,
        }),
      });

      const result = await response.json();
      console.log("End call result:", result);

      if (result.status === "ended") {
        // User who clicked END goes to main screen (no autoMatch)
        router.push(`/simple-video?username=${encodeURIComponent(username)}`);
      } else {
        console.error("End call failed:", result);
        setIsProcessingAction(false);
      }
    } catch (error) {
      console.error("Error processing end call:", error);
      setIsProcessingAction(false);
    }
  }, [username, roomName, router, isProcessingAction]);

  // Handle unexpected disconnections (when other user leaves)
  const handleOtherUserDisconnected = useCallback(async () => {
    if (hasProcessedDisconnection.current || isProcessingAction) {
      return;
    }

    hasProcessedDisconnection.current = true;
    console.log(
      `Other user disconnected, ${username} will be put back in queue`
    );

    try {
      const response = await fetch("/api/simple-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disconnected",
          username: matchedWith, // The other user disconnected
          roomName,
        }),
      });

      const result = await response.json();
      console.log("Disconnection handled:", result);

      // Current user goes back to queue automatically
      router.push(
        `/simple-video?username=${encodeURIComponent(username)}&autoMatch=true`
      );
    } catch (error) {
      console.error("Error handling disconnection:", error);
      // Fallback: go back to main page
      router.push(`/simple-video?username=${encodeURIComponent(username)}`);
    }
  }, [username, matchedWith, roomName, router, isProcessingAction]);

  // Monitor participant changes
  useEffect(() => {
    // Skip if we only have the local participant or haven't connected yet
    if (
      connectionState !== ConnectionState.Connected ||
      participants.length < 2
    ) {
      return;
    }

    // If we were expecting 2 participants but only have 1 (local), other user left
    const remoteParticipants = participants.filter(
      (p) => p.identity !== username
    );

    if (remoteParticipants.length === 0) {
      console.log("No remote participants detected, other user may have left");

      // Add a delay to avoid false disconnection triggers
      const disconnectionTimer = setTimeout(() => {
        if (!hasProcessedDisconnection.current && !isProcessingAction) {
          handleOtherUserDisconnected();
        }
      }, 3000); // 3 second delay

      return () => clearTimeout(disconnectionTimer);
    }
  }, [
    participants,
    connectionState,
    username,
    handleOtherUserDisconnected,
    isProcessingAction,
  ]);

  // Handle connection errors
  const handleConnectionError = useCallback(
    (error: Error) => {
      console.error("LiveKit connection error:", error);
      setConnectionError("Connection failed. Please try again.");

      // Redirect back to main page after a delay
      setTimeout(() => {
        router.push(
          `/simple-video?username=${encodeURIComponent(
            username
          )}&error=connection_failed`
        );
      }, 3000);
    },
    [router, username]
  );

  if (connectionError) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardContent className="p-6 text-center">
          <h2 className="text-xl font-bold text-red-600 mb-4">
            Connection Error
          </h2>
          <p className="text-gray-600 mb-4">{connectionError}</p>
          <p className="text-sm text-gray-500">
            Redirecting back to main page...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header with user info and controls */}
      <div className="bg-gray-800 p-4 flex justify-between items-center">
        <div className="text-white">
          <span className="font-medium">Connected to: {matchedWith}</span>
          <span className="text-gray-400 ml-2">
            ({useDemo ? "Demo" : "Production"})
          </span>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleSkip}
            disabled={isProcessingAction}
            variant="destructive"
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isProcessingAction ? "Processing..." : "SKIP"}
          </Button>

          <Button
            onClick={handleEndCall}
            disabled={isProcessingAction}
            variant="destructive"
            className="bg-red-600 hover:bg-red-700"
          >
            {isProcessingAction ? "Processing..." : "END CALL"}
          </Button>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={true}
          video={true}
          audio={true}
          onError={handleConnectionError}
          className="h-full"
        >
          <VideoConference />

          {/* Connection status indicator */}
          <div className="absolute top-4 left-4 z-10">
            <div
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                connectionState === ConnectionState.Connected
                  ? "bg-green-500 text-white"
                  : connectionState === ConnectionState.Connecting
                  ? "bg-yellow-500 text-black"
                  : "bg-red-500 text-white"
              }`}
            >
              {connectionState === ConnectionState.Connected && "Connected"}
              {connectionState === ConnectionState.Connecting &&
                "Connecting..."}
              {connectionState === ConnectionState.Disconnected &&
                "Disconnected"}
              {connectionState === ConnectionState.Reconnecting &&
                "Reconnecting..."}
            </div>
          </div>
        </LiveKitRoom>
      </div>
    </div>
  );
}
