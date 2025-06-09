import { useEffect, useRef } from "react";
import { api } from "../utils/api";
import { ChatState } from "../types";

interface UseAloneDetectionProps {
  userId: string;
  chatState: ChatState;
  isSkipping: React.MutableRefObject<boolean>;
  setChatState: (state: ChatState) => void;
  setError: (error: string) => void;
  setNeedsRequeue: (needs: boolean) => void;
  stopPolling: () => void;
  stopHeartbeat: () => void;
}

export const useAloneDetection = ({
  userId,
  chatState,
  isSkipping,
  setChatState,
  setError,
  setNeedsRequeue,
  stopPolling,
  stopHeartbeat,
}: UseAloneDetectionProps) => {
  const checkCount = useRef(0);
  const lastCheckTime = useRef(0);

  useEffect(() => {
    let aloneCheckInterval: NodeJS.Timeout | null = null;

    if (chatState === "IN_CALL") {
      // Reset check count when entering call
      checkCount.current = 0;
      lastCheckTime.current = Date.now();

      // Start checking after 3 seconds to give time for both users to join
      const initialDelay = setTimeout(() => {
        aloneCheckInterval = setInterval(async () => {
          try {
            // Skip if we're already handling a skip
            if (isSkipping.current) {
              return;
            }

            const now = Date.now();
            const timeSinceLastCheck = now - lastCheckTime.current;
            
            // Prevent rapid checks
            if (timeSinceLastCheck < 1000) {
              return;
            }

            lastCheckTime.current = now;

            const result = await api.checkAlone(userId);
            
            if (result.isAlone) {
              checkCount.current++;
              console.log(`[AloneDetection] User is alone - check ${checkCount.current}, reason: ${result.reason}`);

              // Require 2 consecutive checks to confirm (to avoid false positives)
              if (checkCount.current >= 2) {
                console.log("[AloneDetection] User confirmed alone - kicking and re-queuing");
                isSkipping.current = true;
                
                // Stop intervals immediately
                stopPolling();
                stopHeartbeat();
                
                // Set error message based on reason
                let errorMessage = "Connection issue - finding new match...";
                if (result.reason === "partner_left") {
                  errorMessage = "Partner left - finding new match...";
                } else if (result.reason === "partner_disconnected") {
                  errorMessage = "Partner disconnected - finding new match...";
                } else if (result.reason === "room_deleted") {
                  errorMessage = "Call ended - finding new match...";
                }
                
                setError(errorMessage);
                setChatState("WAITING");

                // Kick the user and re-queue
                try {
                  await api.kickAlone(userId, result.reason);
                  
                  // Trigger re-queue after a short delay
                  setTimeout(() => {
                    isSkipping.current = false;
                    setNeedsRequeue(true);
                  }, 500);
                  
                  // Clear error after 3 seconds
                  setTimeout(() => {
                    setError("");
                  }, 3000);
                } catch (error) {
                  console.error("[AloneDetection] Error kicking alone user:", error);
                  // Still try to recover
                  isSkipping.current = false;
                  setNeedsRequeue(true);
                }
              }
            } else {
              // Reset count if not alone
              checkCount.current = 0;
            }
          } catch (error) {
            console.error("[AloneDetection] Check error:", error);
          }
        }, 2500); // Check every 2.5 seconds (offset from force-disconnect check)
      }, 3000); // Initial 3-second delay

      return () => {
        if (initialDelay) clearTimeout(initialDelay);
        if (aloneCheckInterval) clearInterval(aloneCheckInterval);
      };
    }

    return () => {
      checkCount.current = 0;
    };
  }, [
    chatState,
    userId,
    isSkipping,
    setChatState,
    setError,
    setNeedsRequeue,
    stopPolling,
    stopHeartbeat,
  ]);
};