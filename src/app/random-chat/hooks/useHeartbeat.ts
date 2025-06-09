import { useCallback, useRef } from "react";
import { api } from "../utils/api";

export const useHeartbeat = (userId: string | null) => {
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = useCallback(async () => {
    if (!userId) {
      console.error("Cannot send heartbeat: userId is null");
      return;
    }
    try {
      console.log("Sending heartbeat for userId:", userId);
      await api.sendHeartbeat(userId);
    } catch (err) {
      console.error("Heartbeat error:", err);
    }
  }, [userId]);

  const startHeartbeat = useCallback(() => {
    sendHeartbeat(); // Send immediately
    heartbeatInterval.current = setInterval(sendHeartbeat, 5000); // Every 5 seconds
  }, [sendHeartbeat]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  }, []);

  return {
    startHeartbeat,
    stopHeartbeat,
  };
}; 