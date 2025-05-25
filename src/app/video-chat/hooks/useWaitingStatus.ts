"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface UseWaitingStatusProps {
  isWaiting: boolean;
  username: string;
  setIsWaiting: (waiting: boolean) => void;
  setError: (error: string) => void;
  setUsingDemoServer: (demo: boolean) => void;
}

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
    let queueProcessingTriggered = false;

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

      // Function to trigger queue processing
      const triggerQueueProcessing = async () => {
        try {
          console.log(`Triggering queue processing for waiting user ${username}`);
          const response = await fetch('/api/trigger-queue-processing', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log(`Queue processing result for ${username}:`, result);
          }
        } catch (error) {
          console.error('Error triggering queue processing:', error);
        }
      };

      // Check immediately
      checkStatus();

      // Trigger queue processing after a short delay to ensure user is in queue
      setTimeout(() => {
        if (!queueProcessingTriggered) {
          queueProcessingTriggered = true;
          triggerQueueProcessing();
        }
      }, 2000);

      // Then poll regularly with more frequent checks
      intervalId = setInterval(() => {
        checkStatus();
        
        // Periodically trigger queue processing to ensure matches are found
        // Trigger every 6 seconds (every 3rd poll)
        const now = Date.now();
        if (now % 6000 < 2000) { // Rough approximation for every 3rd poll
          triggerQueueProcessing();
        }
      }, 2000); // Increased frequency from 2000ms to be more responsive
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isWaiting, username, router, setIsWaiting, setError, setUsingDemoServer]);
} 