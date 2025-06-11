import { useCallback, useRef, useEffect } from "react";
import { api } from "../utils/api";

export const useHeartbeat = (userId: string | null) => {
  const primaryInterval = useRef<NodeJS.Timeout | null>(null);
  const secondaryInterval = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = useCallback(async (isPrimary: boolean) => {
    if (!userId) {
      console.error("Cannot send heartbeat: userId is null");
      return;
    }
    try {
      console.log(`Sending ${isPrimary ? 'primary' : 'secondary'} heartbeat for userId:`, userId);
      await api.sendHeartbeat(userId, isPrimary);
    } catch (err) {
      console.error("Heartbeat error:", err);
    }
  }, [userId]);

  const startHeartbeat = useCallback(() => {
    // Send initial heartbeats
    sendHeartbeat(true);
    sendHeartbeat(false);

    // Set up primary heartbeat (every 10 seconds)
    primaryInterval.current = setInterval(() => {
      sendHeartbeat(true);
    }, 10000);

    // Set up secondary heartbeat (every 30 seconds)
    secondaryInterval.current = setInterval(() => {
      sendHeartbeat(false);
    }, 30000);
  }, [sendHeartbeat]);

  const stopHeartbeat = useCallback(() => {
    if (primaryInterval.current) {
      clearInterval(primaryInterval.current);
      primaryInterval.current = null;
    }
    if (secondaryInterval.current) {
      clearInterval(secondaryInterval.current);
      secondaryInterval.current = null;
    }
  }, []);

  // Handle client-side disconnection signals
  useEffect(() => {
    if (!userId) return;

    const handleBeforeUnload = () => {
      console.log("Before unload event detected, signaling disconnect...");
      // Send a disconnect signal using keepalive to ensure it goes through
      api.signalDisconnect(userId);
      // Note: We don't await here as the browser might close before it resolves
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log("Tab hidden, signaling disconnect...");
        api.signalDisconnect(userId);
      } else if (document.visibilityState === 'visible') {
        console.log("Tab visible, restarting heartbeats...");
        // Optionally restart heartbeats if they were stopped for hidden state
        // (though current design keeps them running)
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId]); // Only re-run if userId changes

  return {
    startHeartbeat,
    stopHeartbeat,
  };
}; 