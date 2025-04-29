"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { DebugInfo } from "../types";

interface UseRoomConnectionProps {
  roomName: string;
  username: string;
  useDemo?: boolean;
}

interface UseRoomConnectionResult {
  token: string;
  error: string;
  isLoading: boolean;
  debugInfo: DebugInfo | null;
  usingDemoServer: boolean;
  liveKitUrl: string;
  participantCount: number;
  isRedirecting: boolean;
  retryConnection: () => Promise<void>;
  toggleDemoServer: () => void;
  handleOtherParticipantDisconnected: (otherUsername: string) => void;
}

export function useRoomConnection({
  roomName,
  username,
  useDemo = false,
}: UseRoomConnectionProps): UseRoomConnectionResult {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [usingDemoServer, setUsingDemoServer] = useState(useDemo);
  const [liveKitUrl, setLiveKitUrl] = useState("");
  const [participantCount, setParticipantCount] = useState(0);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const router = useRouter();
  // Use ref to track if navigation has been initiated
  const hasInitiatedNavigation = useRef(false);

  // Reset navigation state when room or username changes
  useEffect(() => {
    setIsRedirecting(false);
    hasInitiatedNavigation.current = false;
  }, [roomName, username]);

  // Get token from the API
  const fetchToken = useCallback(
    async (useDemoServer: boolean) => {
      setIsLoading(true);
      setError("");

      try {
        // Ensure room name is sanitized
        const safeRoomName = roomName.replace(/[^a-zA-Z0-9-]/g, "");
        if (safeRoomName.length === 0) {
          setError(
            "Invalid room name. Please use only letters, numbers, and hyphens."
          );
          setIsLoading(false);
          return false;
        }

        console.log(
          `Attempting to get token for room: ${safeRoomName}, user: ${username}, useDemo: ${useDemoServer}`
        );

        // Set LiveKit URL immediately based on demo status
        if (useDemoServer) {
          setLiveKitUrl("wss://demo.livekit.cloud");
        } else {
          const publicUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
          setLiveKitUrl(publicUrl);
          console.log(`Using configured LiveKit URL: ${publicUrl}`);
        }

        const response = await fetch(
          `/api/get-livekit-token?room=${safeRoomName}&username=${username}&useDemo=${useDemoServer}`
        );
        const data = await response.json();

        if (data.error) {
          console.error(`Token error: ${data.error}`);
          // Set specific error message for room full condition
          if (data.error.includes("Room is full")) {
            setError(
              "This room is already full (maximum 2 participants allowed). Please try a different room."
            );
          } else {
            setError(`Failed to get token: ${data.error}`);
          }
          return false;
        }

        console.log("Successfully received token");

        // Log the debug info
        if (data.debug) {
          console.log("Debug info:", data.debug);
          setDebugInfo(data.debug);

          // Update participant count if available
          if (data.participantCount !== undefined) {
            setParticipantCount(data.participantCount);
            console.log(
              `Initial participant count from server: ${data.participantCount}`
            );
          }
        }

        // Make sure the token is a string
        if (typeof data.token === "string") {
          console.log(`Token received (length: ${data.token.length})`);
          setToken(data.token);
          return true;
        } else {
          console.error("Invalid token format received:", typeof data.token);
          setError("Invalid token format received from server");
          return false;
        }
      } catch (error: unknown) {
        console.error("Failed to get token:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setError(`Error fetching token: ${errorMessage}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [roomName, username]
  );

  // Handle when another participant disconnects
  const handleOtherParticipantDisconnected = useCallback(
    (otherUsername: string) => {
      console.log(
        `Other participant ${otherUsername} disconnected, redirecting to entry page with reset flag...`
      );

      // Don't do anything if we're already redirecting or have initiated navigation
      if (isRedirecting || hasInitiatedNavigation.current) {
        console.log("Already redirecting or navigation initiated, skipping");
        return;
      }

      setIsRedirecting(true);
      hasInitiatedNavigation.current = true;

      // Notify server about disconnection
      try {
        fetch("/api/user-disconnect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username,
            roomName: roomName,
            reason: "user_left",
          }),
        })
          .then((response) => response.json())
          .then((data) => {
            console.log("Disconnection response:", data);

            // Redirect to the name entry page with reset flag
            router.push("/video-chat?reset=true");
          })
          .catch((error) => {
            console.error("Error notifying server about disconnection:", error);
            // Still redirect in case of error
            router.push("/video-chat?reset=true");
          });
      } catch (e) {
        console.error("Error notifying server about disconnection:", e);
        router.push("/video-chat?reset=true");
      }
    },
    [username, roomName, router, isRedirecting]
  );

  // Toggle between normal and demo server
  const toggleDemoServer = () => {
    setUsingDemoServer(!usingDemoServer);
  };

  // Try connection again
  const retryConnection = async () => {
    await fetchToken(usingDemoServer);
  };

  // Initial token fetch
  useEffect(() => {
    fetchToken(usingDemoServer);
  }, [fetchToken, usingDemoServer]);

  // Component cleanup on unmount - notify server about disconnection
  useEffect(() => {
    return () => {
      // Only send if we have valid room and username
      if (roomName && username) {
        console.log("Component unmounting, notifying about disconnection");
        try {
          // Use sendBeacon for more reliable sending on page unload
          const data = JSON.stringify({
            username,
            roomName,
            reason: "user_left",
          });

          if (navigator.sendBeacon) {
            navigator.sendBeacon("/api/user-disconnect", data);
          } else {
            // Fallback for browsers that don't support sendBeacon
            fetch("/api/user-disconnect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: data,
              keepalive: true,
            });
          }
        } catch (e) {
          console.error("Error sending disconnect notification on unmount:", e);
        }
      }
    };
  }, [roomName, username]);

  return {
    token,
    error,
    isLoading,
    debugInfo,
    usingDemoServer,
    liveKitUrl,
    participantCount,
    isRedirecting,
    retryConnection,
    toggleDemoServer,
    handleOtherParticipantDisconnected,
  };
} 