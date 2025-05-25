import { useCallback, useState, useRef } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { useRouter } from 'next/navigation';
import { handleDisconnection, resetNavigationState } from '@/utils/disconnectionService';

interface UseRoomActionsProps {
  username: string;
  roomName: string;
}

export function useRoomActions({ username, roomName }: UseRoomActionsProps) {
  const room = useRoomContext();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const navigationOccurred = useRef(false);
  
  // Reset the redirecting state
  const resetRedirectingState = useCallback(() => {
    setIsRedirecting(false);
    navigationOccurred.current = false;
    resetNavigationState();
  }, []);

  // Handle leaving the call to return to the search screen (SKIP)
  const handleLeaveCall = useCallback(async () => {
    console.log("Leave call (SKIP) initiated, redirecting state:", isRedirecting);

    // If already redirecting or navigation occurred, do nothing
    if (isRedirecting || navigationOccurred.current) {
      console.log(
        "Already redirecting or navigation occurred, ignoring leave call"
      );
      return;
    }

    // Set the flags immediately to prevent multiple clicks
    setIsRedirecting(true);
    navigationOccurred.current = true;

    console.log(
      "Leave call proceeding, both users will be put back into queue"
    );

    if (room) {
      // Get the other participant's identity before leaving
      let otherParticipantIdentity: string | undefined;
      if (room.remoteParticipants.size === 1) {
        // There should be only one remote participant in a 1:1 call
        otherParticipantIdentity = Array.from(
          room.remoteParticipants.values()
        )[0].identity;
        console.log(`Found other participant: ${otherParticipantIdentity}`);
      }

      try {
        // First notify the backend about the skip (both users will be requeued)
        await handleDisconnection({
          username,
          roomName,
          otherUsername: otherParticipantIdentity,
          reason: "user_left", // This indicates a skip scenario
          router,
          preventAutoMatch: false, // Allow auto-match after skip since user goes back to queue
        });

        // Then disconnect from the LiveKit room
        room.disconnect();
      } catch (e) {
        console.error("Error initiating leave call:", e);
        // Still disconnect and redirect in case of error
        room.disconnect();
        const url = new URL("/video-chat", window.location.origin);
        url.searchParams.set("reset", "true");
        url.searchParams.set("username", username);
        url.searchParams.set("autoMatch", "true"); // Auto-match after skip
        router.push(url.toString());
      }
    }
  }, [room, username, roomName, router, isRedirecting]);

  // Handle ending the call completely and returning to the initial page (END CALL)
  const handleEndCall = useCallback(async () => {
    console.log("End call initiated, redirecting state:", isRedirecting);

    if (isRedirecting || navigationOccurred.current) {
      console.log(
        "Already redirecting or navigation occurred, ignoring end call"
      );
      return;
    }

    setIsRedirecting(true);
    navigationOccurred.current = true;

    console.log(
      "End call proceeding, user goes to main screen, other user goes to queue"
    );

    if (room) {
      let otherParticipantIdentity: string | undefined;
      if (room.remoteParticipants.size === 1) {
        otherParticipantIdentity = Array.from(
          room.remoteParticipants.values()
        )[0].identity;
      }

      try {
        // 1. Explicitly cancel any match/queue for this user
        const cancelResponse = await fetch("/api/cancel-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        if (!cancelResponse.ok) {
          console.warn(
            "Failed to cancel match, proceeding with disconnect anyway"
          );
        } else {
          console.log("Successfully cancelled match/queue");
        }

        // 2. Notify the backend about the session end (user who clicked END goes to main, other goes to queue)
        await handleDisconnection({
          username,
          roomName,
          otherUsername: otherParticipantIdentity,
          reason: "session_end", // This indicates an end call scenario
          router,
          preventAutoMatch: true, // Don't auto-match the user who clicked END
        });

        // 3. Disconnect from the LiveKit room
        if (room.state !== "disconnected") {
          room.disconnect();
        }
      } catch (e) {
        console.error("Error ending call:", e);
        // Fallback: attempt to disconnect and navigate manually if handleDisconnection fails
        if (room && room.state !== "disconnected") {
          room.disconnect();
        }
        const url = new URL("/video-chat", window.location.origin);
        url.searchParams.set("reset", "true");
        url.searchParams.set("username", username);
        router.push(url.toString());
      }
    }
  }, [room, username, roomName, router, isRedirecting]);

  return {
    isRedirecting,
    resetRedirectingState,
    handleLeaveCall,
    handleEndCall,
    room
  };
} 