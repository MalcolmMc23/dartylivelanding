"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Clock, Zap } from "lucide-react";

interface UnifiedUserState {
  username: string;
  status: "waiting" | "matched" | "in-call";
  roomName?: string;
  matchedWith?: string;
  useDemo: boolean;
  joinedAt: number;
  lastActivity?: number;
}

interface UnifiedQueueStats {
  waitingCount: number;
  matchedCount: number;
  totalUsers: number;
}

interface SimpleQueueManagerProps {
  username: string;
  useDemo?: boolean;
  onMatched?: (roomName: string, matchedWith: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function SimpleQueueManager({
  username,
  useDemo = false,
  onMatched,
  onError,
  className = "",
}: SimpleQueueManagerProps) {
  const [userState, setUserState] = useState<UnifiedUserState | null>(null);
  const [queueStats, setQueueStats] = useState<UnifiedQueueStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldownEndTime, setCooldownEndTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  // Poll for status updates
  const pollStatus = useCallback(async () => {
    try {
      const [statusResponse, statsResponse] = await Promise.all([
        fetch(
          `/api/simple-queue?username=${encodeURIComponent(
            username
          )}&action=status`
        ),
        fetch("/api/simple-queue?action=stats"),
      ]);

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        setUserState(statusData.user);

        // Handle matched state
        if (
          statusData.user?.status === "matched" &&
          statusData.user.roomName &&
          statusData.user.matchedWith &&
          onMatched
        ) {
          onMatched(statusData.user.roomName, statusData.user.matchedWith);
        }
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setQueueStats(statsData);
      }
    } catch (error) {
      console.error("Error polling status:", error);
    }
  }, [username, onMatched]);

  // Handle cooldown timer
  useEffect(() => {
    if (!cooldownEndTime) {
      setTimeRemaining("");
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = cooldownEndTime - now;

      if (remaining <= 0) {
        setCooldownEndTime(null);
        setTimeRemaining("");
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [cooldownEndTime]);

  // Set up polling
  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [pollStatus]);

  const handleFindMatch = async () => {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/simple-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          username,
          useDemo,
        }),
      });

      const result = await response.json();

      if (result.status === "matched") {
        setMessage(`🎉 Matched with ${result.matchedWith}!`);
        if (onMatched && result.roomName && result.matchedWith) {
          onMatched(result.roomName, result.matchedWith);
        }
      } else if (result.status === "waiting") {
        setMessage("🔍 Looking for someone to chat with...");
      } else if (result.status === "error") {
        const errorMsg = result.error || "Failed to join queue";
        setMessage(`❌ ${errorMsg}`);
        if (onError) onError(errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setMessage(`❌ ${errorMsg}`);
      if (onError) onError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipMatch = async () => {
    if (!userState?.matchedWith) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/simple-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "skip",
          username,
          otherUsername: userState.matchedWith,
        }),
      });

      const result = await response.json();

      if (result.status === "skipped") {
        setMessage("⏭️ Skipped to next person");
        if (result.cooldownEndsAt) {
          setCooldownEndTime(result.cooldownEndsAt);
        }
      } else {
        setMessage(`❌ ${result.error || "Failed to skip"}`);
      }
    } catch (error) {
      setMessage(
        `❌ ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveMatch = async () => {
    if (!userState?.matchedWith) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/simple-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "leave",
          username,
          otherUsername: userState.matchedWith,
        }),
      });

      const result = await response.json();

      if (result.status === "left") {
        setMessage("👋 Left the conversation");
      } else {
        setMessage(`❌ ${result.error || "Failed to leave"}`);
      }
    } catch (error) {
      setMessage(
        `❌ ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopSearch = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/simple-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          username,
        }),
      });

      await response.json();
      setMessage("🛑 Stopped searching");
    } catch (error) {
      setMessage(
        `❌ ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isWaiting = userState?.status === "waiting";
  const isMatched = userState?.status === "matched";
  const hasCooldown = timeRemaining !== "";

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Main Action Card */}
      <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardContent className="p-6 text-center">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {isMatched
                ? "🎥 Connected!"
                : isWaiting
                ? "🔍 Searching..."
                : "💬 Ready to Chat"}
            </h2>

            {message && <p className="text-lg text-gray-600 mb-4">{message}</p>}

            {hasCooldown && (
              <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-600" />
                  <span className="text-yellow-800 font-medium">
                    Wait {timeRemaining} before searching again
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {!isWaiting && !isMatched && !hasCooldown && (
              <Button
                onClick={handleFindMatch}
                disabled={isLoading}
                size="lg"
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-4 text-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Find Random Match
                  </>
                )}
              </Button>
            )}

            {isWaiting && (
              <Button
                onClick={handleStopSearch}
                disabled={isLoading}
                variant="outline"
                size="lg"
                className="w-full border-red-300 text-red-600 hover:bg-red-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Stop Searching
              </Button>
            )}

            {isMatched && (
              <div className="space-y-2">
                <Button
                  onClick={handleSkipMatch}
                  disabled={isLoading}
                  variant="outline"
                  size="lg"
                  className="w-full border-blue-300 text-blue-600 hover:bg-blue-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  ⏭️ Skip to Next
                </Button>

                <Button
                  onClick={handleLeaveMatch}
                  disabled={isLoading}
                  variant="outline"
                  size="lg"
                  className="w-full border-red-300 text-red-600 hover:bg-red-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  👋 Leave Chat
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Queue Stats */}
      {queueStats && (
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{queueStats.waitingCount} waiting</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>{queueStats.matchedCount} chatting</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                <span>{queueStats.totalUsers} total online</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
