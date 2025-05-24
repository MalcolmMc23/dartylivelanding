"use client";

import { useCallback, useState } from "react";

interface StateRecoveryProps {
  username: string;
  onRecoveryComplete?: () => void;
}

export function StateRecovery({
  username,
  onRecoveryComplete,
}: StateRecoveryProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");

  const performStateRecovery = useCallback(async () => {
    if (!username || isRecovering) return;

    setIsRecovering(true);
    setRecoveryMessage("Recovering your connection state...");

    try {
      // Step 1: Cancel any existing matches/queues
      const cancelResponse = await fetch("/api/cancel-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (cancelResponse.ok) {
        setRecoveryMessage("Cleared existing state...");
      }

      // Step 2: Clear any left-behind state
      await fetch("/api/match-user", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      // Step 3: Brief wait to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setRecoveryMessage("State recovery completed!");

      // Call completion callback if provided
      if (onRecoveryComplete) {
        onRecoveryComplete();
      }
    } catch (error) {
      console.error("Error during state recovery:", error);
      setRecoveryMessage("Recovery failed. Please refresh the page.");
    } finally {
      setIsRecovering(false);

      // Clear message after a delay
      setTimeout(() => {
        setRecoveryMessage("");
      }, 3000);
    }
  }, [username, isRecovering, onRecoveryComplete]);

  return (
    <div className="bg-yellow-900/30 border border-yellow-600 text-yellow-300 text-sm p-3 rounded mb-4">
      <p className="mb-2">
        Having connection issues? This can help reset your state.
      </p>

      {recoveryMessage && (
        <p className="text-yellow-200 mb-2">{recoveryMessage}</p>
      )}

      <button
        onClick={performStateRecovery}
        disabled={isRecovering}
        className="w-full bg-yellow-800 hover:bg-yellow-700 text-white py-1 rounded text-xs disabled:opacity-50"
      >
        {isRecovering ? "Recovering..." : "Reset Connection State"}
      </button>
    </div>
  );
}
