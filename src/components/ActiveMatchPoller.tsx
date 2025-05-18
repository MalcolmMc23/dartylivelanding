"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface ActiveMatchPollerProps {
  username: string;
  isLeftBehind: boolean;
  useDemo: boolean;
}

export function ActiveMatchPoller({
  username,
  isLeftBehind,
  useDemo,
}: ActiveMatchPollerProps) {
  const router = useRouter();
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  const pollFrequency = 2000; // Increase polling interval to reduce server load

  useEffect(() => {
    // Only start polling if this user was left behind by another user
    if (isLeftBehind && username) {
      console.log(
        `Starting active polling for new match for left-behind user ${username}`
      );

      // Clear any existing interval
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }

      // Function to check for matches
      const checkForMatch = async () => {
        try {
          const response = await fetch("/api/match-user", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username,
              useDemo,
              isRematching: true, // Flag to indicate this is a left-behind user
            }),
          });

          const data = await response.json();
          console.log(`Poll result for ${username}:`, data);

          // If matched, redirect to the match room
          if (data.status === "matched") {
            console.log(
              `Match found for left-behind user ${username} with ${data.matchedWith} in room ${data.roomName}`
            );

            // Clear interval
            if (pollingInterval.current) {
              clearInterval(pollingInterval.current);
              pollingInterval.current = null;
            }

            // Navigate to the new room
            router.push(
              `/video-chat/room/${data.roomName}?username=${encodeURIComponent(
                username
              )}`
            );
          }

          // Update poll count for logging purposes
          pollCountRef.current += 1;

          // Log status every 10 polls
          if (pollCountRef.current % 10 === 0) {
            console.log(
              `Still polling for match after ${pollCountRef.current} attempts`
            );
          }
        } catch (error) {
          console.error("Error polling for match:", error);
        }
      };

      // Poll immediately
      checkForMatch();

      // Then set up interval
      pollingInterval.current = setInterval(checkForMatch, pollFrequency);
    }

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, [username, isLeftBehind, useDemo, router]);

  // This component doesn't render anything visible
  return null;
}
