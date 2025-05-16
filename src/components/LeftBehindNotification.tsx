"use client";

import { useState, useEffect } from "react";
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

  const [timeLeft, setTimeLeft] = useState(15);
  const router = useRouter();

  // Auto-redirect countdown when user is left behind
  useEffect(() => {
    if (isLeftBehind && newRoomName && !isMatched) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            onJoinNewRoom(newRoomName);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    } else if (isMatched && matchRoom) {
      // If already matched, redirect immediately to that room
      onJoinNewRoom(matchRoom);
    } else {
      // Reset timer when not left behind
      setTimeLeft(15);
    }
  }, [isLeftBehind, newRoomName, isMatched, matchRoom, onJoinNewRoom]);

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
              Preparing a new room for you. You&apos;ll be redirected in{" "}
              {timeLeft} seconds.
            </p>
            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={() => onJoinNewRoom(newRoomName || "")}
                className="bg-white text-red-600 px-4 py-2 rounded font-semibold hover:bg-gray-100"
              >
                Join New Room Now
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
