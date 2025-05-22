"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type RoomMatchingState = {
  roomName: string;
  username: string;
  usingDemoServer: boolean;
  isWaiting: boolean;
  error: string;
  resetProcessed: boolean;
};

export type RoomMatchingActions = {
  findRandomChat: (usernameToUse?: string) => Promise<void>;
  cancelWaiting: () => Promise<void>;
  setUsername: (username: string) => void;
  setError: (error: string) => void;
  findRandomChatRef: React.MutableRefObject<() => void>;
};

export function useRoomMatching(): [RoomMatchingState, RoomMatchingActions] {
  const [roomName, setRoomName] = useState("");
  const [username, setUsername] = useState("");
  const [usingDemoServer, setUsingDemoServer] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState("");
  const resetProcessedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const findRandomChatRef = useRef<() => void>(() => {});
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Define findRandomChat with useCallback
  const findRandomChat = useCallback(
    async (usernameToUse?: string) => {
      let finalUsername = usernameToUse || username;

      // If username is not set, fetch it from the backend
      if (!finalUsername) {
        try {
          const res = await fetch("/api/auth/get-username", {
            credentials: "include",
          });
          if (res.ok) {
            const data = await res.json();
            finalUsername = data.username;
            setUsername(finalUsername);
          } else {
            throw new Error("Could not fetch username");
          }
        } catch {
          setError("Failed to fetch your username. Please try again.");
          return;
        }
      }
      
      if (!finalUsername) return;

      setError("");
      setIsWaiting(true);

      try {
        // Call the API to either join the waiting queue or get matched immediately
        const response = await fetch("/api/match-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: finalUsername,
            useDemo: usingDemoServer,
            isRematching: searchParams.get("autoMatch") === "true",
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Match response:", data);

        if (data.status === "matched") {
          // We got matched immediately!
          setRoomName(data.roomName);
          setUsingDemoServer(data.useDemo); // Use the demo setting that was decided
          setIsWaiting(false);
          // Navigate to the canonical room route
          router.push(
            `/video-chat/room/${data.roomName}?username=${encodeURIComponent(
              finalUsername
            )}`
          );
        } else if (data.status === "waiting") {
          // We're in the waiting queue
          console.log("Added to waiting queue, waiting for match...");
          // Stay in waiting state, the polling will check for updates
        } else if (data.error) {
          throw new Error(data.error);
        }
      } catch (error) {
        console.error("Error finding random chat:", error);
        setError(
          `Failed to find chat: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        setIsWaiting(false);
      }
    },
    [usingDemoServer, username, searchParams, router]
  );

  // Store the latest findRandomChat in a ref to avoid stale closure
  useEffect(() => {
    findRandomChatRef.current = () => findRandomChat();
  }, [findRandomChat]);

  // Check if this is an auto-match redirect
  useEffect(() => {
    console.log(
      "Checking URL parameters for auto-matching, direct join, and reset flags"
    );
    const roomNameFromUrl = searchParams.get("roomName");
    const usernameFromUrl = searchParams.get("username");
    const autoMatch = searchParams.get("autoMatch");
    const reset = searchParams.get("reset");
    const useDemoFromUrl = searchParams.get("useDemo") === "true"; // Check for demo flag

    // Handle reset first
    if (reset === "true" && !resetProcessedRef.current) {
      console.log("Reset parameter detected - clearing all state");
      resetProcessedRef.current = true;

      const currentUsername = username || usernameFromUrl || "";

      setRoomName("");
      setIsWaiting(false);
      setError("");

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("reset");
        if (currentUsername) {
          url.searchParams.set("username", currentUsername);
          setUsername(currentUsername);
        }
        window.history.replaceState({}, "", url.toString());
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
          }
        }, 100);
      }
      return; // Exit early
    }
    if (reset !== "true") {
      resetProcessedRef.current = false;
    }

    // Handle direct join if roomName and username are in URL (and not resetting or auto-matching implicitly)
    if (roomNameFromUrl && usernameFromUrl && !autoMatch && reset !== "true") {
      console.log(
        `Direct join requested for room: ${roomNameFromUrl}, user: ${usernameFromUrl}`
      );
      setRoomName(roomNameFromUrl);
      setUsername(usernameFromUrl);
      setUsingDemoServer(useDemoFromUrl);
      // Navigate directly to the canonical room route instead of rendering here
      router.push(
        `/video-chat/room/${roomNameFromUrl}?username=${encodeURIComponent(
          usernameFromUrl
        )}`
      );
      return; // Important to return to prevent other logic paths
    }

    // Handle auto-match (only if not already handled by direct join)
    if (autoMatch === "true" && usernameFromUrl && reset !== "true") {
      console.log(
        `Auto-match explicitly requested for user: ${usernameFromUrl}`
      );

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("autoMatch");
        url.searchParams.delete("timestamp"); // Assuming timestamp was for uniqueness
        window.history.replaceState({}, "", url.toString());
      }
      // Ensure username state is set if not already by previous conditions
      if (!username) setUsername(usernameFromUrl);
      // Set usingDemoServer if present in autoMatch URL
      if (searchParams.has("useDemo")) {
        setUsingDemoServer(searchParams.get("useDemo") === "true");
      }

      setTimeout(() => {
        console.log(`Triggering auto-match for ${usernameFromUrl}`);
        findRandomChat(usernameFromUrl); // Pass username explicitly
      }, 800);
      return; // Return after initiating auto-match
    }

    // Set username if only username is present (and not other conditions met)
    if (usernameFromUrl && reset !== "true" && !autoMatch && !roomNameFromUrl) {
      console.log(
        `Username found in URL: ${usernameFromUrl}, setting username state (not auto-matching or direct joining)`
      );
      setUsername(usernameFromUrl);
      // Set usingDemoServer if present
      if (searchParams.has("useDemo")) {
        setUsingDemoServer(searchParams.get("useDemo") === "true");
      }
    } else if (
      !usernameFromUrl &&
      !roomNameFromUrl &&
      !autoMatch &&
      reset !== "true"
    ) {
      console.log(
        "No direct join, auto-match, or relevant username parameters found"
      );
    }
  }, [searchParams, findRandomChat, username, router]);

  const cancelWaiting = async () => {
    if (username && isWaiting) {
      try {
        // Call the API to cancel waiting
        const response = await fetch("/api/cancel-match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username }),
        });

        if (!response.ok) {
          console.error("Failed to cancel matching:", response.statusText);
        } else {
          console.log("Successfully canceled matching");
        }
      } catch (error) {
        console.error("Error canceling wait:", error);
      }
    }
    setIsWaiting(false);
  };

  return [
    {
      roomName,
      username,
      usingDemoServer,
      isWaiting,
      error,
      resetProcessed: resetProcessedRef.current,
    },
    {
      findRandomChat,
      cancelWaiting,
      setUsername,
      setError,
      findRandomChatRef,
    },
  ];
} 