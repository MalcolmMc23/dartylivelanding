"use client";

import { useRouter } from "next/navigation";
import { useLeftBehindStatus } from "./hooks/useLeftBehindStatus";

interface LeftBehindNotificationProps {
  username: string;
  onJoinNewRoom: (roomName: string) => void;
}

export function LeftBehindNotification({
  username,
  onJoinNewRoom,
}: LeftBehindNotificationProps) {
  const {
    isLeftBehind,
    newRoomName,
    disconnectedFrom,
    isMatched,
    matchedWith,
    matchRoom,
  } = useLeftBehindStatus(username);

  const router = useRouter();

  // If matched and have a match room, join it
  if (isMatched && matchRoom) {
    onJoinNewRoom(matchRoom);
    return null;
  }

  if (!isLeftBehind || (!newRoomName && !isMatched)) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-500 text-white p-4 shadow-xl">
      <div className="max-w-4xl mx-auto">
        {isMatched ? (
          <p className="font-semibold text-center">
            We&apos;ve found you a new match! Connecting you with {matchedWith}
            ...
          </p>
        ) : (
          <>
            <p className="font-semibold text-center">
              {disconnectedFrom} has left the chat.
            </p>
            <p className="text-center mt-2">
              A new room has been prepared for you.
            </p>
            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={() => onJoinNewRoom(newRoomName || "")}
                className="bg-white text-red-600 px-4 py-2 rounded font-semibold hover:bg-gray-100"
              >
                Join New Room
              </button>
              <button
                onClick={() => router.push("/")}
                className="bg-transparent border border-white text-white px-4 py-2 rounded font-semibold hover:bg-red-600"
              >
                Return Home
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
