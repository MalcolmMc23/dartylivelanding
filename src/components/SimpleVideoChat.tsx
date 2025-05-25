"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users, Clock } from "lucide-react";
import { QueuePositionIndicator } from "./QueuePositionIndicator";

interface SimpleVideoChatProps {
  defaultUsername?: string;
}

export function SimpleVideoChat({ defaultUsername }: SimpleVideoChatProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [username, setUsername] = useState(defaultUsername || "");
  const [isSearching, setIsSearching] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [useDemo, setUseDemo] = useState(false);

  // Get URL parameters
  const autoMatch = searchParams.get("autoMatch") === "true";
  const error = searchParams.get("error");

  console.log(
    `SimpleVideoChat: username=${username}, autoMatch=${autoMatch}, isSearching=${isSearching}`
  );

  // Auto-match on page load if flag is set
  useEffect(() => {
    if (autoMatch && username && !isSearching) {
      console.log(`Auto-matching triggered for ${username}`);
      handleFindMatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMatch, username]);

  // Show error if present
  useEffect(() => {
    if (error) {
      const errorMessages: Record<string, string> = {
        connection_failed: "Connection failed. Please try again.",
        match_failed: "Could not find a match. Please try again.",
        server_error: "Server error occurred. Please try again.",
      };
      setStatusMessage(
        errorMessages[error] || "An error occurred. Please try again."
      );
    }
  }, [error]);

  // Find match function
  const handleFindMatch = useCallback(async () => {
    if (!username.trim()) {
      setStatusMessage("Please enter a username");
      return;
    }

    if (isSearching) return;

    setIsSearching(true);
    setStatusMessage("Looking for someone to chat with...");
    setQueuePosition(null);

    try {
      const response = await fetch("/api/simple-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "find_match",
          username: username.trim(),
          useDemo,
        }),
      });

      const result = await response.json();
      console.log("Match result:", result);

      if (result.status === "matched") {
        // Matched! Get the token and redirect to room
        setStatusMessage(`Matched with ${result.matchedWith}! Connecting...`);

        // Get LiveKit token
        const tokenResponse = await fetch("/api/get-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            roomName: result.roomName,
            useDemo: result.useDemo,
          }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.token) {
          // Redirect to room
          const roomUrl = new URL("/simple-video/room", window.location.origin);
          roomUrl.searchParams.set("roomName", result.roomName);
          roomUrl.searchParams.set("username", username.trim());
          roomUrl.searchParams.set("matchedWith", result.matchedWith);
          roomUrl.searchParams.set("useDemo", result.useDemo.toString());
          roomUrl.searchParams.set("token", tokenData.token);
          roomUrl.searchParams.set("serverUrl", tokenData.liveKitUrl);

          router.push(roomUrl.toString());
        } else {
          throw new Error("Failed to get access token");
        }
      } else if (result.status === "waiting") {
        // Added to queue, start polling
        setStatusMessage("Waiting for someone to join...");
        setQueuePosition(result.position || null);
        startPolling();
      } else {
        throw new Error(result.error || "Unknown error occurred");
      }
    } catch (error) {
      console.error("Error finding match:", error);
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to find match"
      );
      setIsSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, useDemo, router, isSearching]);

  // Polling function to check for matches
  const startPolling = useCallback(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/simple-match?username=${encodeURIComponent(username.trim())}`
        );
        const status = await response.json();

        console.log("Poll result:", status);

        if (status.status === "matched") {
          clearInterval(pollInterval);
          setStatusMessage(`Matched with ${status.matchedWith}! Connecting...`);

          // Get token and redirect
          const tokenResponse = await fetch("/api/get-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: username.trim(),
              roomName: status.roomName,
              useDemo: status.useDemo,
            }),
          });

          const tokenData = await tokenResponse.json();

          if (tokenData.token) {
            const roomUrl = new URL(
              "/simple-video/room",
              window.location.origin
            );
            roomUrl.searchParams.set("roomName", status.roomName);
            roomUrl.searchParams.set("username", username.trim());
            roomUrl.searchParams.set("matchedWith", status.matchedWith);
            roomUrl.searchParams.set("useDemo", status.useDemo.toString());
            roomUrl.searchParams.set("token", tokenData.token);
            roomUrl.searchParams.set("serverUrl", tokenData.liveKitUrl);

            router.push(roomUrl.toString());
          }
        } else if (status.status === "waiting") {
          setQueuePosition(status.position || null);
        } else {
          // Error or user not in queue
          clearInterval(pollInterval);
          setStatusMessage("Connection lost. Please try again.");
          setIsSearching(false);
        }
      } catch (error) {
        console.error("Polling error:", error);
        clearInterval(pollInterval);
        setStatusMessage("Connection error. Please try again.");
        setIsSearching(false);
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isSearching) {
        handleStopSearching();
      }
    }, 5 * 60 * 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, router, isSearching]);

  // Stop searching
  const handleStopSearching = useCallback(async () => {
    setIsSearching(false);
    setStatusMessage("");
    setQueuePosition(null);

    try {
      await fetch("/api/simple-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          username: username.trim(),
        }),
      });
    } catch (error) {
      console.error("Error canceling search:", error);
    }
  }, [username]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-800">
            Simple Video Chat
          </CardTitle>
          <p className="text-gray-600">Connect with random people instantly</p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Username input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Your name:
            </label>
            <Input
              type="text"
              placeholder="Enter your name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSearching}
              className="text-center"
              maxLength={20}
            />
          </div>

          {/* Demo mode toggle */}
          <div className="flex items-center justify-center space-x-2">
            <input
              type="checkbox"
              id="demo-mode"
              checked={useDemo}
              onChange={(e) => setUseDemo(e.target.checked)}
              disabled={isSearching}
              className="rounded"
            />
            <label htmlFor="demo-mode" className="text-sm text-gray-600">
              Use demo server
            </label>
          </div>

          {/* Status message */}
          {statusMessage && (
            <div className="text-center">
              <p
                className={`text-sm ${
                  statusMessage.includes("error") ||
                  statusMessage.includes("failed")
                    ? "text-red-600"
                    : "text-blue-600"
                }`}
              >
                {statusMessage}
              </p>
              {queuePosition && (
                <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full mt-2">
                  <Users className="w-3 h-3 mr-1" />
                  Position: {queuePosition}
                </span>
              )}
            </div>
          )}

          {/* Queue Position Indicator */}
          {isSearching && <QueuePositionIndicator username={username} />}

          {/* Action buttons */}
          <div className="space-y-3">
            {!isSearching ? (
              <Button
                onClick={handleFindMatch}
                disabled={!username.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                <Users className="w-4 h-4 mr-2" />
                Find Random Match
              </Button>
            ) : (
              <Button
                onClick={handleStopSearching}
                variant="destructive"
                className="w-full"
                size="lg"
              >
                <Clock className="w-4 h-4 mr-2" />
                Stop Searching
              </Button>
            )}
          </div>

          {/* Instructions */}
          <div className="text-xs text-gray-500 text-center space-y-1">
            <p>
              • Click &ldquo;Find Random Match&rdquo; to connect with someone
            </p>
            <p>• Use &ldquo;Skip&rdquo; to find a new person</p>
            <p>• Use &ldquo;End Call&rdquo; to return to this screen</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
