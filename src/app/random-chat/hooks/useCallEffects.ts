import { useEffect } from "react";
import { api } from "../utils/api";
import { ChatState } from "../types";

interface UseCallEffectsProps {
  userId: string;
  chatState: ChatState;
  token: string | null;
  needsRequeue: boolean;
  isSkipping: React.MutableRefObject<boolean>;
  setChatState: (state: ChatState) => void;
  setSessionId: (id: string) => void;
  setError: (error: string) => void;
  setNeedsRequeue: (needs: boolean) => void;
  startMatching: () => void;
  stopPolling: () => void;
  stopHeartbeat: () => void;
}

export const useCallEffects = ({
  userId,
  chatState,
  token,
  needsRequeue,
  isSkipping,
  setChatState,
  setSessionId,
  setError,
  setNeedsRequeue,
  startMatching,
  stopPolling,
  stopHeartbeat,
}: UseCallEffectsProps) => {
  // Handle re-queuing when force disconnected
  useEffect(() => {
    if (needsRequeue && chatState === "WAITING") {
      setNeedsRequeue(false);
      startMatching();
    }
  }, [needsRequeue, chatState, startMatching, setNeedsRequeue]);

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
  }, [chatState, userId, token, stopPolling, stopHeartbeat, isSkipping, setChatState, setError, setNeedsRequeue, setSessionId]);
}; 