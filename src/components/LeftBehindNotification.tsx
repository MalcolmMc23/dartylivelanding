"use client";

import { useLeftBehindStatus } from "./hooks/useLeftBehindStatus";
import { useEffect, useRef } from "react";

interface LeftBehindNotificationProps {
  username: string;
  onJoinNewRoom: (roomName: string) => void;
}

export function LeftBehindNotification({
  username,
  onJoinNewRoom,
}: LeftBehindNotificationProps) {
  const { isMatched, matchRoom } = useLeftBehindStatus(username);
  const hasRedirectedRef = useRef(false);

  // Use useEffect to handle the redirect instead of doing it during render
  useEffect(() => {
    // Only redirect if matched with room info and we haven't redirected yet
    if (isMatched && matchRoom && !hasRedirectedRef.current) {
      console.log(
        `LeftBehindNotification: Redirecting to match room ${matchRoom}`
      );
      hasRedirectedRef.current = true;
      // Set a short timeout to avoid state updates during render
      setTimeout(() => {
        onJoinNewRoom(matchRoom);
      }, 0);
    }
  }, [isMatched, matchRoom, onJoinNewRoom]);

  // Always return null - don't show any notification UI
  return null;
}
