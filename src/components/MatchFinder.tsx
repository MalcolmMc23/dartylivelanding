"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUnifiedMatchPoller } from "./hooks/useUnifiedMatchPoller";
import { StateRecovery } from "./StateRecovery";

interface MatchFinderProps {
  username: string;
}

interface DebugInfo {
  queuePosition?: number;
  queueLength?: number;
  waitTime?: number;
  matchedWith?: string;
  [key: string]: unknown;
}

export function MatchFinder({ username }: MatchFinderProps) {
  const router = useRouter();
  const [waitTime, setWaitTime] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [forceReset, setForceReset] = useState(false);

  // Use unified match poller instead of custom polling logic
  useUnifiedMatchPoller({
    username,
    isWaiting: !isCancelling && !forceReset,
    pollingInterval: 2000,
  });

  // Format wait time as minutes:seconds
  const formattedWaitTime = useCallback(() => {
    const minutes = Math.floor(waitTime / 60);
    const seconds = waitTime % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [waitTime]);

  // Increment wait time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setWaitTime((prevTime) => prevTime + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Format current wait time for logs
  const logWithTime = useCallback(
    (message: string) => {
      console.log(`[${formattedWaitTime()}] ${message}`);
    },
    [formattedWaitTime]
  );

  // Function to force a cleanup of the user's state in the matching system
  const forceCleanupUser = useCallback(async () => {
    try {
      setForceReset(true);

      // First try to cancel any existing match
      logWithTime(`Forcing cleanup for user ${username}`);

      const cancelResponse = await fetch("/api/cancel-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });

      await cancelResponse.json();

      // Short delay to ensure the server processes the cancellation
      await new Promise((resolve) => setTimeout(resolve, 500));

      setForceReset(false);
      setError(null);
      setDebugInfo(null);

      // Reset wait time to give visual feedback that something changed
      setWaitTime(0);

      logWithTime(`Cleanup complete, resuming match search for ${username}`);
    } catch (cleanupError) {
      console.error("Error during forced cleanup:", cleanupError);
      setError(`Cleanup failed: ${String(cleanupError)}`);
      setForceReset(false);
    }
  }, [username, logWithTime]);

  // Note: Match checking is now handled by useUnifiedMatchPoller hook

  // Handle cancel button click
  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    logWithTime(`User cancelled matching`);

    try {
      await fetch("/api/cancel-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });
    } catch (error) {
      console.error("Error cancelling match:", error);
    }

    // Return to video-chat page without automatch parameter
    router.push(`/video-chat?username=${encodeURIComponent(username)}`);
  }, [router, username, logWithTime]);

  return (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <div className="bg-[#2A2A2A] rounded-lg p-8 w-full max-w-md flex flex-col items-center">
        <h1 className="text-white text-2xl font-bold mb-8">
          Finding You a Match.
        </h1>

        {/* Loading spinner */}
        <div className="relative w-24 h-24 mb-6">
          <div
            className={`absolute inset-0 rounded-full border-t-2 border-[#A0FF00] ${
              forceReset ? "opacity-50" : "animate-spin"
            }`}
          ></div>
          {forceReset && (
            <div className="absolute inset-0 flex items-center justify-center text-yellow-400 text-xs">
              Resetting...
            </div>
          )}
        </div>

        <p className="text-white text-lg mb-2">Hi {username}!</p>
        <p className="text-gray-300 mb-2">
          Waiting for someone to chat with...
        </p>
        <p className="text-gray-400 text-sm mb-4">
          Wait time: {formattedWaitTime()}
        </p>

        {/* Error display */}
        {error && (
          <div className="w-full bg-red-900/30 border border-red-800 text-red-300 text-sm p-3 rounded mb-4">
            {error}
            <button
              onClick={forceCleanupUser}
              disabled={forceReset}
              className="mt-2 w-full bg-red-800 hover:bg-red-700 text-white py-1 rounded text-xs"
            >
              {forceReset ? "Resetting..." : "Reset My Status"}
            </button>
          </div>
        )}

        {/* State recovery component - show after waiting for a while */}
        {waitTime > 30 && (
          <StateRecovery
            username={username}
            onRecoveryComplete={() => {
              setError(null);
              setWaitTime(0);
            }}
          />
        )}

        {/* Debug info toggle */}
        <div className="w-full mb-4">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-gray-500 text-xs hover:text-gray-300"
          >
            {showDebug ? "Hide Debug Info" : "Show Debug Info"}
          </button>

          {showDebug && debugInfo && (
            <div className="mt-2 bg-gray-800 p-3 rounded text-gray-300 text-xs font-mono overflow-x-auto">
              <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          )}
        </div>

        <button
          onClick={handleCancel}
          disabled={isCancelling || forceReset}
          className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCancelling ? "Cancelling..." : "Cancel"}
        </button>
      </div>
    </div>
  );
}
