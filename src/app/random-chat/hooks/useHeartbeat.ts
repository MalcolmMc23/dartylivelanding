import { useCallback, useRef } from "react";
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

  return {
    startHeartbeat,
    stopHeartbeat,
  };
}; 