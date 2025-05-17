"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { handleDisconnection } from "@/utils/disconnectionService";

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

    console.log(
      `Other participant left, preparing redirection handling for ${username}`
    );

    // Add a slight delay to allow cleanup processes to complete
    const redirectTimer = setTimeout(async () => {
      try {
        // Check for left-behind status first
        const response = await fetch(
          `/api/check-left-behind-status?username=${encodeURIComponent(
            username
          )}`
        );
        const data = await response.json();

        if (data.status === "already_matched" && data.roomName) {
          // User already has a match, go to that room
          console.log(
            `User ${username} already has a match in room ${data.roomName}, redirecting there`
          );
          router.push(
            `/video-chat/room/${encodeURIComponent(
              data.roomName
            )}?username=${encodeURIComponent(username)}`
          );
          return;
        }

        if (data.status === "left_behind" && data.newRoomName) {
          // User is in left-behind state but not matched yet
          // Let the LeftBehindNotification component handle this
          console.log(
            `User ${username} is in left-behind state, notification will handle it`
          );
          redirectInProgressRef.current = false;
          return;
        }

        // Otherwise proceed with disconnection handling and auto-matching
        console.log(
          `Normal disconnection handling for ${username}, going to auto-match`
        );

        // Use disconnection service to properly handle state
        await handleDisconnection({
          username,
          roomName,
          reason: "user_left",
          router,
          redirectToNewRoom: true,
        });
      } catch (error) {
        console.error("Error during redirection handling:", error);

        // Fallback to original redirection logic
        console.log(
          `Falling back to default auto-match redirection for ${username}`
        );

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
      } finally {
        redirectInProgressRef.current = false;
      }
    }, 1000); // Reduced to 1-second delay since we now have better handling

    return () => {
      clearTimeout(redirectTimer);
    };
  }, [otherParticipantLeft, username, roomName, router]);

  // This component doesn't render anything
  return null;
}
