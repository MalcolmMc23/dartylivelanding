import { useCallback, useRef, useState } from "react";
import { ChatState, MatchData } from "../types";
import { api } from "../utils/api";

export const useMatching = (
  userId: string,
  onMatch: (matchData: MatchData) => Promise<void>,
  startHeartbeat: () => void,
  stopHeartbeat: () => void
) => {
  const [chatState, setChatState] = useState<ChatState>("IDLE");
  const [error, setError] = useState<string>("");
  const [needsRequeue, setNeedsRequeue] = useState(false);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const isEndingCall = useRef(false);
  const isSkipping = useRef(false);
  const notInQueueCount = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    notInQueueCount.current = 0;
  }, []);

  const startPolling = useCallback(() => {
    pollingInterval.current = setInterval(async () => {
      try {
        // Check force disconnect first
        const disconnectData = await api.checkDisconnect(userId);
        if (disconnectData.shouldDisconnect) {
          console.log("Force disconnect detected - handling immediately");
          stopPolling();
          setChatState("WAITING");
          setError("Skipped by other user - finding new match...");
          setNeedsRequeue(true);
          
          setTimeout(() => {
            setError("");
          }, 3000);
          
          return;
        }

        // Check for matches
        const data = await api.checkMatch(userId);
        console.log("Poll response:", data);

        if (data.matched) {
          console.log("Match found via polling!");
          stopPolling();
          await onMatch(data.data!);
        } else if (!data.inQueue) {
          // Increment counter for consecutive "not in queue" responses
          notInQueueCount.current++;
          console.log(`Not in queue (attempt ${notInQueueCount.current}/3)`);

          if (notInQueueCount.current >= 3) {
            // Only stop after 3 consecutive "not in queue" responses
            console.log("Consistently not in queue, attempting to re-queue");
            stopPolling();
            
            // Try to re-queue the user
            try {
              const reQueueData = await api.enqueue(userId);
              if (reQueueData.matched) {
                console.log("Found match while re-queuing!");
                await onMatch(reQueueData.data!);
              } else {
                console.log("Re-queued successfully, starting polling again");
                startPolling();
              }
            } catch (err) {
              console.error("Error re-queuing:", err);
              setError("Failed to find match");
              setChatState("IDLE");
            }
          }
        } else {
          // Reset counter if we're in queue
          notInQueueCount.current = 0;
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
  }, [userId, onMatch, stopPolling]);

  const startMatching = useCallback(async () => {
    if (!userId) {
      console.error("Cannot start matching: userId is null");
      setError("User ID not initialized");
      return;
    }

    console.log("Starting matching with userId:", userId);
    setChatState("WAITING");
    setError("");
    notInQueueCount.current = 0;

    try {
      startHeartbeat();

      // Check current state before enqueueing
      const currentState = await api.checkMatch(userId);
      console.log("Current state before enqueue:", currentState);

      if (currentState.matched) {
        console.log("Already matched with someone!");
        await onMatch(currentState.data!);
        return;
      }

      if (currentState.inQueue) {
        console.log("Already in queue, starting polling");
        startPolling();
        return;
      }

      console.log("Enqueueing user:", userId);
      const data = await api.enqueue(userId);
      console.log("Enqueue response:", data);

      if (data.matched) {
        console.log("Immediate match found!");
        await onMatch(data.data!);
      } else {
        console.log("No immediate match, starting polling...");
        startPolling();
      }
    } catch (err) {
      console.error("Error in startMatching:", err);
      setError(err instanceof Error ? err.message : "Failed to start matching");
      setChatState("IDLE");
      stopHeartbeat();
    }
  }, [userId, startHeartbeat, onMatch, startPolling, stopHeartbeat]);

  const cancelWaiting = useCallback(async () => {
    stopPolling();
    stopHeartbeat();

    try {
      await api.endCall(userId, "cancel");
    } catch (err) {
      console.error("Error canceling:", err);
    }

    setChatState("IDLE");
    setError("");
  }, [userId, stopPolling, stopHeartbeat]);

  return {
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
  };
}; 