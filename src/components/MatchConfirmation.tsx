"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingIndicator } from "./room/LoadingIndicator";

interface MatchConfirmationProps {
  username: string;
  roomName: string;
  matchedWith: string;
  useDemo: boolean;
}

export function MatchConfirmation({
  username,
  roomName,
  matchedWith,
}: MatchConfirmationProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyAndJoin = async () => {
      try {
        // Verify the match exists
        const response = await fetch("/api/verify-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, roomName }),
        });

        if (!response.ok) {
          throw new Error("Match verification failed");
        }

        const data = await response.json();

        if (data.verified) {
          // Match verified, proceed to room
          console.log(`Match verified, joining room ${roomName}`);
          router.push(
            `/video-chat/room/${roomName}?username=${encodeURIComponent(
              username
            )}`
          );
        } else {
          throw new Error(data.reason || "Match not found");
        }
      } catch (error) {
        console.error("Error verifying match:", error);
        setError(
          error instanceof Error ? error.message : "Verification failed"
        );

        // Redirect back to main page after a delay
        setTimeout(() => {
          router.push(`/video-chat?username=${encodeURIComponent(username)}`);
        }, 3000);
      }
    };

    verifyAndJoin();
  }, [username, roomName, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white">
        <div className="text-red-500 mb-4">{error}</div>
        <div className="text-gray-400">Redirecting back...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white">
      <LoadingIndicator />
      <div className="mt-4 text-lg">Confirming match with {matchedWith}...</div>
    </div>
  );
}
