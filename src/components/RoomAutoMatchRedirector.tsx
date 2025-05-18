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

    // Optional safety timer that we may create later
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

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

        // 1. If the server already paired us with someone, go straight there.
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

        if (data.status === "left_behind") {
          /**
           * 2. The user has been marked as "left_behind".  From this point on we trust
           *    ActiveMatchPoller + LeftBehindNotification to move them to a new room.
           *    We purposely DO NOT call handleDisconnection here, otherwise we would
           *    remove the left-behind record that the server relies on for pairing.
           */

          console.log(
            `User ${username} is in left-behind state – waiting for automatic re-match.`
          );

          // Optional safety-net: after N seconds, if no match arrived, ensure
          // the user is still in the queue but don't force a navigation
          const SAFETY_TIMEOUT_MS = 15000; // 15 seconds

          safetyTimer = setTimeout(async () => {
            try {
              console.log(
                `Safety-net triggered for ${username}. No new match after ${SAFETY_TIMEOUT_MS}ms.`
              );

              // Instead of redirecting, just check and ensure user is still in queue
              const response = await fetch(
                `/api/check-left-behind-status?username=${encodeURIComponent(
                  username
                )}`
              );
              const data = await response.json();

              if (
                data.status !== "left_behind" &&
                data.status !== "already_matched"
              ) {
                console.log(
                  "User no longer in left-behind state, ensuring they stay in queue"
                );

                // Re-add to queue if not already in a match
                await fetch("/api/match-user", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    username,
                    useDemo: false, // We don't know this value here, so default to false
                    isRematching: true,
                  }),
                });
              }
            } catch (err) {
              console.error("Safety-net check failed:", err);
            }
          }, SAFETY_TIMEOUT_MS);

          // We do NOT call handleDisconnection right now – we wait for the safety timer.
          return; // exit the redirectTimer callback early
        }

        /**
         * 3. Normal case – we were *not* marked left-behind, so proceed with the
         *    standard disconnection flow and let the server place us back in the
         *    matching queue.
         */

        console.log(
          `Normal disconnection handling for ${username}, going to auto-match.`
        );

        await handleDisconnection({
          username,
          roomName,
          reason: "user_disconnected",
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
        if (safetyTimer) clearTimeout(safetyTimer);
      }
    }, 1000); // Reduced to 1-second delay since we now have better handling

    return () => {
      clearTimeout(redirectTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [otherParticipantLeft, username, roomName, router]);

  // This component doesn't render anything
  return null;
}
