"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  // Use ref to track if navigation has been initiated
  const hasInitiatedNavigation = useRef(false);
  // Use ref to track if disconnect action has been triggered
  const hasTriggeredDisconnectAction = useRef(false);
  // Track if connection has been stable
  const hasEstablishedStableConnection = useRef(false);
  // Track cleanup state to prevent multiple calls
  const isCleaningUp = useRef(false);

  // Reset navigation state when room or username changes
  useEffect(() => {
    setIsRedirecting(false);
    hasInitiatedNavigation.current = false;
    hasTriggeredDisconnectAction.current = false;
    hasEstablishedStableConnection.current = false;
    isCleaningUp.current = false;
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
          `/api/get-livekit-token?room=${safeRoomName}&username=${username}&useDemo=${useDemoServer}&initialMatching=true`
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
          
          // Mark connection as stable after a short delay
          // This prevents premature disconnection handling during initial connection
          setTimeout(() => {
            hasEstablishedStableConnection.current = true;
            console.log("Connection marked as stable");
          }, 3000);
          
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
        `Other participant ${otherUsername} disconnected, redirecting to initial screen`
      );

      // Don't do anything if we've already triggered disconnect action
      if (hasTriggeredDisconnectAction.current) {
        console.log("Already handled disconnect action, skipping");
        return;
      }

      // Don't handle disconnections until we have a stable connection
      if (!hasEstablishedStableConnection.current) {
        console.log("Connection not yet stable, ignoring disconnection event");
        return;
      }

      // Mark that we've handled the disconnection so we don't trigger this again
      hasTriggeredDisconnectAction.current = true;

      // Add a longer grace period (10 seconds) to avoid premature disconnection handling
      // This helps with initial connection issues and network fluctuations
      setTimeout(() => {
        // Notify server about disconnection - this will handle the disconnection logic
        try {
          fetch("/api/user-disconnect", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username: username, // Current user
              otherUsername: otherUsername, // User who disconnected
              roomName: roomName,
              reason: "user_disconnected",
            }),
          })
            .then((response) => response.json())
            .then((data) => {
              console.log("Disconnection response:", data);
              
              // Navigate back to video chat page with reset flag
              if (!hasInitiatedNavigation.current) {
                hasInitiatedNavigation.current = true;
                setIsRedirecting(true);
                
                // Add a small delay to ensure state updates and allow server to process
                setTimeout(() => {
                  const url = new URL("/video-chat", window.location.origin);
                  url.searchParams.set("reset", "true");
                  url.searchParams.set("username", username);
                  url.searchParams.set("autoMatch", "true"); // Automatically try to find a new match
                  
                  // Use the router from the component that renders this hook
                  // This will happen automatically due to the unmount effect in RoomComponent
                  console.log("Redirecting to:", url.toString());
                }, 500);
              }
            })
            .catch((error) => {
              console.error("Error notifying server about disconnection:", error);
            });
        } catch (e) {
          console.error("Error notifying server about disconnection:", e);
        }
      }, 10000); // 10-second grace period
    },
    [roomName, username]
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

  // Clean up when the component unmounts
  useEffect(() => {
    return () => {
      // Only perform cleanup if we have a username and room name and haven't already cleaned up
      if (username && roomName && !isCleaningUp.current && hasEstablishedStableConnection.current) {
        isCleaningUp.current = true;
        console.log(`Cleanup on unmount for user ${username} in room ${roomName}`);
        
        // Clean up room tracking when component unmounts
        try {
          fetch("/api/user-disconnect", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username,
              roomName,
              reason: "component_cleanup"
            }),
            // Use keepalive to ensure the request completes even if the page is unloading
            keepalive: true
          }).catch(e => {
            console.error("Error during cleanup:", e);
          });
        } catch (e) {
          console.error("Error during cleanup:", e);
        }
      }
    };
  }, [username, roomName]);

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