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
      try {
        // Step 1: Notify the server that this user was left alone
        // and should be placed in the general matchmaking queue.
        // This call ensures the server cleans up the old room state for this user
        // and makes them available for matching from the main /video-chat page.
        console.log(
          `RoomAutoMatchRedirector: Notifying server for ${username} being left in ${roomName}.`
        );
        const notifyResponse = await fetch("/api/user-disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            roomName,
            reason: "partner_left_nav_to_matchmaking", // A specific reason
          }),
        });

        if (!notifyResponse.ok) {
          console.warn(
            `RoomAutoMatchRedirector: Server notification for ${username} failed: ${notifyResponse.status}`
          );
          // Proceed with navigation even if notification fails, to unblock the user.
        } else {
          const notifyData = await notifyResponse.json();
          console.log(
            `RoomAutoMatchRedirector: Server notification response for ${username}:`,
            notifyData
          );
        }
      } catch (apiError) {
        console.error(
          `RoomAutoMatchRedirector: API call to notify server for ${username} failed:`,
          apiError
        );
        // Proceed with navigation even if notification fails.
      } finally {
        // Step 2: ALWAYS navigate the user to the main matchmaking page.
        console.log(
          `RoomAutoMatchRedirector: Navigating ${username} to matchmaking page.`
        );
        const url = new URL("/video-chat", window.location.origin);
        url.searchParams.set("username", username);
        url.searchParams.set("autoMatch", "true"); // Ensure they start matching
        url.searchParams.set("fromRoom", roomName); // Contextual, optional
        url.searchParams.set("timestamp", Date.now().toString()); // Prevent caching

        // Clear session storage items that might interfere with a fresh matchmaking start
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("roomPageMounted");
          window.sessionStorage.removeItem("skipDisconnect");
          // Potentially clear other room-specific states if necessary
        }

        router.push(url.toString());
        // Note: actionInProgressRef will remain true for this instance.
        // If the component unmounts and remounts, it will get a new ref.
        // This is generally fine as navigation will occur.
      }
    }, 1000); // 1-second delay to allow other cleanup or state updates

    return () => {
      clearTimeout(timer);
      // Reset ref if component unmounts before action completes,
      // though navigation usually makes this less critical.
      actionInProgressRef.current = false;
    };
  }, [otherParticipantLeft, username, roomName, router]);

  // This component doesn't render anything
  return null;
}
