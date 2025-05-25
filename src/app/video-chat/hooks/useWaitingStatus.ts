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
    const waitStartTime = Date.now();
    let consecutiveAloneChecks = 0;

    if (isWaiting && username) {
      // Initial check immediately when entering waiting state
      const checkStatus = async () => {
        try {
          // First check for pending matches using the check-match API
          const checkMatchResponse = await fetch('/api/check-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
          });
          
          if (checkMatchResponse.ok) {
            const checkMatchData = await checkMatchResponse.json();
            
            if (checkMatchData.match) {
              // User has been matched (either active or pending)!
              console.log(
                `Matched with ${checkMatchData.matchedWith} in room ${checkMatchData.roomName} (type: ${checkMatchData.debug?.matchType || 'unknown'})`
              );
              setIsWaiting(false);
              setUsingDemoServer(checkMatchData.useDemo);
              router.push(
                `/video-chat/room/${checkMatchData.roomName}?username=${encodeURIComponent(
                  username
                )}`
              );
              return;
            }
          }

          // If no match found via check-match, fall back to the original polling logic
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
          } else if (data.status === "waiting") {
            // Check if user has been waiting alone for too long
            const waitTime = Date.now() - waitStartTime;
            
            // Get queue status to see if there are other users
            try {
              const queueResponse = await fetch('/api/production-health?action=status&detailed=true');
              const queueData = await queueResponse.json();
              
              // If queue count is 1 or less (just this user or empty), increment alone counter
              if (queueData.queueCount <= 1) {
                consecutiveAloneChecks++;
                console.log(`User ${username} appears to be alone in queue (check ${consecutiveAloneChecks})`);
                
                // If user has been alone for 5 consecutive checks (10 seconds) and waited more than 15 seconds total
                if (consecutiveAloneChecks >= 5 && waitTime > 15000) {
                  console.log(`User ${username} has been waiting alone for too long, stopping wait`);
                  setIsWaiting(false);
                  setError("No other users are currently looking for a match. Please try again later.");
                  return;
                }
              } else {
                // Reset counter if there are other users
                consecutiveAloneChecks = 0;
              }
            } catch (queueError) {
              console.error("Error checking queue status:", queueError);
            }
            
            // Also check for very long wait times regardless of queue status
            if (waitTime > 60000) { // 1 minute
              console.log(`User ${username} has been waiting for over 1 minute, stopping wait`);
              setIsWaiting(false);
              setError("Unable to find a match. Please try again later.");
              return;
            }
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
      }, 2000); // Check every 2 seconds
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isWaiting, username, router, setIsWaiting, setError, setUsingDemoServer]);
} 