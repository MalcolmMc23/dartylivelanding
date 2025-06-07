import { useCallback, useState } from "react";
import { api } from "../utils/api";

export const useLiveKit = (
  userId: string,
  onError: (error: string) => void
) => {
  const [token, setToken] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");

  const connectToRoom = useCallback(async (roomName: string) => {
    try {
      const token = await api.getLiveKitToken(roomName, userId);
      setToken(token);
      return true;
    } catch (err) {
      console.error("Error getting token:", err);
      onError(err instanceof Error ? err.message : "Failed to connect to video");
      return false;
    }
  }, [userId, onError]);

  const disconnectFromRoom = useCallback(async () => {
    if (sessionId) {
      try {
        await api.endCall(userId, sessionId);
      } catch (err) {
        console.error("Error ending session:", err);
      }
    }
    setToken("");
    setSessionId("");
  }, [userId, sessionId]);

  const handleLiveKitError = useCallback((error: Error) => {
    console.error("LiveKit error:", error);
    onError("Connection error occurred");
  }, [onError]);

  const handleLiveKitConnected = useCallback(async () => {
    console.log("LiveKit connected successfully!");
    try {
      await api.checkDisconnect(userId);
    } catch (err) {
      console.error("Error clearing disconnect flag:", err);
    }
  }, [userId]);

  return {
    token,
    sessionId,
    setSessionId,
    connectToRoom,
    disconnectFromRoom,
    handleLiveKitError,
    handleLiveKitConnected,
  };
}; 