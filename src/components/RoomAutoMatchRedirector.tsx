"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface RoomAutoMatchRedirectorProps {
  username: string;
  roomName: string;
  otherParticipantLeft: boolean;
  matchFound?: boolean; // New prop to indicate if a match was found by ActiveMatchPoller
}

/**
 * This component handles the auto-matching redirection when a user
 * is left alone in a room (other participant disconnected)
 *
 * It will NOT redirect if ActiveMatchPoller already found a match
 */
export function RoomAutoMatchRedirector({
  username,
  roomName,
  otherParticipantLeft,
  matchFound = false, // Default to false
}: RoomAutoMatchRedirectorProps) {
  const router = useRouter();
  const actionInProgressRef = useRef(false);

  useEffect(() => {
    if (!otherParticipantLeft || !username || !roomName) return;

    if (actionInProgressRef.current) {
      console.log(
        `RoomAutoMatchRedirector: Action already in progress for ${username}. Skipping.`
      );
      return;
    }
    actionInProgressRef.current = true;

    console.log(
      `RoomAutoMatchRedirector: Other participant left room ${roomName}. ${username} will be re-queued and sent to matchmaking page.`
    );

    const timer = setTimeout(async () => {
      // First check if ActiveMatchPoller already found a match (from props or sessionStorage)
      const matchFoundInSession =
        typeof window !== "undefined" &&
        window.sessionStorage.getItem("matchFound") === "true";

      if (matchFound || matchFoundInSession) {
        console.log(
          `RoomAutoMatchRedirector: Match already found for ${username}, skipping redirection`
        );
        actionInProgressRef.current = false;
        return;
      }

      console.log(
        `RoomAutoMatchRedirector: No match found in time window for ${username}, proceeding with fallback navigation`
      );

      try {
        // Step 2: ALWAYS navigate the user to the main matchmaking page.
        console.log(
          `RoomAutoMatchRedirector: Navigating ${username} to matchmaking page.`
        );
        const url = new URL("/video-chat", window.location.origin);
        url.searchParams.set("username", username);
        url.searchParams.set("reset", "true"); // Ensure state is reset
        url.searchParams.set("autoMatch", "true"); // Ensure they start matching
        url.searchParams.set("fromRoom", roomName); // Contextual, optional
        url.searchParams.set("timestamp", Date.now().toString()); // Prevent caching

        // Clear session storage items that might interfere with a fresh matchmaking start
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("roomPageMounted");
          window.sessionStorage.removeItem("skipDisconnect");
          window.sessionStorage.removeItem("matchFound"); // Clear match found flag
        }

        router.push(url.toString());
        // Note: actionInProgressRef will remain true for this instance.
        // If the component unmounts and remounts, it will get a new ref.
        // This is generally fine as navigation will occur.
      } catch (error) {
        console.error("Error navigating:", error);
        actionInProgressRef.current = false;
      }
    }, 5000); // Increased to 5 seconds to give ActiveMatchPoller more time

    return () => {
      clearTimeout(timer);
      // Reset ref if component unmounts before action completes,
      // though navigation usually makes this less critical.
      actionInProgressRef.current = false;
    };
  }, [otherParticipantLeft, username, roomName, router, matchFound]);

  // This component doesn't render anything
  return null;
}
