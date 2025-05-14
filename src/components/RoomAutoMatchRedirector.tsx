"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface RoomAutoMatchRedirectorProps {
  username: string;
  roomName: string;
  otherParticipantLeft: boolean;
}

/**
 * This component handles the auto-matching redirection when a user
 * is left alone in a room (other participant disconnected)
 */
export function RoomAutoMatchRedirector({
  username,
  roomName,
  otherParticipantLeft,
}: RoomAutoMatchRedirectorProps) {
  const router = useRouter();
  const redirectInProgressRef = useRef(false);

  useEffect(() => {
    // Only trigger if the other participant has left
    if (!otherParticipantLeft || !username) return;

    // Prevent multiple redirects
    if (redirectInProgressRef.current) return;

    // Set the flag to prevent multiple redirects
    redirectInProgressRef.current = true;

    console.log(`Other participant left, preparing auto-match for ${username}`);

    // Add a slight delay to allow cleanup processes to complete
    const redirectTimer = setTimeout(async () => {
      try {
        console.log(`Redirecting ${username} to auto-match page`);

        // Construct URL with parameters for auto-matching
        const url = new URL("/video-chat", window.location.origin);
        url.searchParams.set("username", username);
        url.searchParams.set("autoMatch", "true");
        url.searchParams.set("timestamp", Date.now().toString()); // Prevent caching

        // Clear any previous room page mounting flag from sessionStorage
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("roomPageMounted");
          window.sessionStorage.removeItem("skipDisconnect");
        }

        // Use router.push for client-side navigation
        router.push(url.toString());
      } catch (error) {
        console.error("Error during auto-match redirect:", error);
        redirectInProgressRef.current = false;
      }
    }, 2000); // 2-second delay

    return () => {
      clearTimeout(redirectTimer);
    };
  }, [otherParticipantLeft, username, roomName, router]);

  // This component doesn't render anything
  return null;
}
