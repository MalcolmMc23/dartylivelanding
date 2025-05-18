"use client";

import { useLeftBehindStatus } from "./hooks/useLeftBehindStatus";

interface LeftBehindNotificationProps {
  username: string;
  onJoinNewRoom: (roomName: string) => void;
}

export function LeftBehindNotification({
  username,
  onJoinNewRoom,
}: LeftBehindNotificationProps) {
  const { isMatched, matchRoom } = useLeftBehindStatus(username);

  // If matched and have a match room, join it
  if (isMatched && matchRoom) {
    onJoinNewRoom(matchRoom);
    return null;
  }

  // Return null - don't show any notification UI
  return null;
}
