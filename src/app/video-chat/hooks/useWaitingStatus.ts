"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type UseWaitingStatusProps = {
  isWaiting: boolean;
  username: string;
  setIsWaiting: (isWaiting: boolean) => void;
  setError: (error: string) => void;
  setUsingDemoServer: (usingDemo: boolean) => void;
};

export function useWaitingStatus({
  isWaiting,
  username,
  setIsWaiting,
  setError,
  setUsingDemoServer,
}: UseWaitingStatusProps) {
  const router = useRouter();

  // Function to poll status while waiting
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isWaiting && username) {
      // Initial check immediately when entering waiting state
      const checkStatus = async () => {
        try {
          const response = await fetch(
            `/api/match-user?username=${encodeURIComponent(username)}`
          );
          const data = await response.json();

          console.log("Poll status:", data);

          if (data.status === "matched") {
            // User has been matched with someone!
            console.log(
              `Matched with ${data.matchedWith} in room ${data.roomName}`
            );
            setIsWaiting(false);
            setUsingDemoServer(data.useDemo);
            router.push(
              `/video-chat/room/${data.roomName}?username=${encodeURIComponent(
                username
              )}`
            );
          } else if (data.status === "not_waiting") {
            // This could happen if the server restarted or the user's session expired
            console.log("User no longer in waiting queue, cancelling wait");
            setIsWaiting(false);
            setError("Lost your place in the queue. Please try again.");
          }
        } catch (error) {
          console.error("Error polling status:", error);
        }
      };

      // Check immediately
      checkStatus();

      // Then poll regularly
      intervalId = setInterval(checkStatus, 2000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isWaiting, username, router, setIsWaiting, setError, setUsingDemoServer]);
} 