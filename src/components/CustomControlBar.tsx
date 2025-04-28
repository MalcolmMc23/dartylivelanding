"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import {
  ControlBar as LiveKitControlBar,
  ControlBarProps,
  useRoomContext,
} from "@livekit/components-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface CustomControlBarProps extends ControlBarProps {
  username: string;
  roomName: string;
}

export function CustomControlBar({
  username,
  roomName,
  ...props
}: CustomControlBarProps) {
  const room = useRoomContext();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  // Use a ref to track whether navigation happened
  const navigationOccurred = useRef(false);

  // Handle disconnection cleanup
  useEffect(() => {
    return () => {
      if (room && room.state === "connected") {
        // This will run if the component unmounts while connected
        console.log("Component unmounting while connected, disconnecting...");
        room.disconnect();
      }
    };
  }, [room]);

  // Reset the redirecting state when the component mounts or when username/roomName changes
  useEffect(() => {
    setIsRedirecting(false);
    navigationOccurred.current = false;
  }, [username, roomName]);

  // Handle leaving the call to return to the search screen
  const handleLeaveCall = useCallback(() => {
    console.log("Leave call initiated, redirecting state:", isRedirecting);

    // If already redirecting or navigation occurred, do nothing
    if (isRedirecting || navigationOccurred.current) {
      console.log(
        "Already redirecting or navigation occurred, ignoring leave call"
      );
      return;
    }

    setIsRedirecting(true);
    navigationOccurred.current = true;

    console.log("Leave call proceeding, returning to search screen");

    // Disconnect from the current room
    if (room) {
      // Notify the server that we're leaving
      try {
        fetch("/api/user-disconnect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            roomName,
            reason: "user_left",
          }),
        })
          .then((response) => response.json())
          .then((data) => {
            console.log("Leave call response:", data);

            // Disconnect from the current room
            room.disconnect();

            // Add a short delay before redirecting
            setTimeout(() => {
              // Redirect to video chat without auto-match parameters
              router.push(
                `/video-chat?username=${encodeURIComponent(username)}`
              );
            }, 500);
          })
          .catch((error) => {
            console.error("Error leaving call:", error);
            // Still redirect in case of error
            room.disconnect();
            setTimeout(() => {
              router.push(
                `/video-chat?username=${encodeURIComponent(username)}`
              );
            }, 500);
          });
      } catch (e) {
        console.error("Error initiating leave call:", e);
        room.disconnect();
        setTimeout(() => {
          router.push(`/video-chat?username=${encodeURIComponent(username)}`);
        }, 500);
      }
    }
  }, [room, username, roomName, router, isRedirecting]);

  // Handle the "Find New Match" button click
  const handleFindNewMatch = useCallback(() => {
    console.log("Find new match initiated, redirecting state:", isRedirecting);

    // If already redirecting or navigation occurred, do nothing
    if (isRedirecting || navigationOccurred.current) {
      console.log(
        "Already redirecting or navigation occurred, ignoring find new match"
      );
      return;
    }

    setIsRedirecting(true);
    navigationOccurred.current = true;

    console.log("Find new match proceeding");

    // Disconnect from the current room
    if (room) {
      // Notify the server that we're looking for a new match
      try {
        fetch("/api/user-disconnect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            roomName,
            reason: "find_new_match",
          }),
        })
          .then((response) => response.json())
          .then((data) => {
            console.log("Find new match response:", data);

            // Disconnect from the current room
            room.disconnect();

            // Add a short delay before redirecting
            setTimeout(() => {
              // Redirect to video chat without auto-match parameters
              router.push(
                `/video-chat?username=${encodeURIComponent(username)}`
              );
            }, 500);
          })
          .catch((error) => {
            console.error("Error finding new match:", error);
            // Still redirect in case of error
            room.disconnect();
            setTimeout(() => {
              router.push(
                `/video-chat?username=${encodeURIComponent(username)}`
              );
            }, 500);
          });
      } catch (e) {
        console.error("Error initiating find new match:", e);
        room.disconnect();
        setTimeout(() => {
          router.push(`/video-chat?username=${encodeURIComponent(username)}`);
        }, 500);
      }
    }
  }, [room, username, roomName, router, isRedirecting]);

  // Create a merged props object that includes our custom behavior
  const controlBarProps: ControlBarProps = {
    ...props,
    // Override the default leave behavior
    controls: {
      ...props.controls,
      leave: true,
    },
    variation: "minimal",
    className: "bg-[#1A1A1A] border-none rounded-lg shadow-lg px-4",
  };

  // Use Effect to override the default disconnect button behavior
  useEffect(() => {
    // Keep track of added event listeners to avoid duplicates
    const processedButtons = new Set();

    // Handler function to be added to the leave/disconnect button
    const handleClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Leave button clicked, returning to search screen");
      handleLeaveCall();
    };

    // Function to check and attach listeners
    const attachListeners = () => {
      // Check for leave buttons with more specific selectors
      const leaveButtons = document.querySelectorAll(
        '.lk-disconnect-button, .lk-leave-button, button[aria-label="Leave call"], button[aria-label="Disconnect"], button[title="Leave"], button[title="Disconnect"]'
      );
      console.log(`Found ${leaveButtons.length} leave/disconnect buttons`);

      leaveButtons.forEach((button) => {
        if (!processedButtons.has(button)) {
          console.log("Found leave button, attaching click handler", button);
          button.addEventListener("click", handleClick);
          processedButtons.add(button);
        }
      });
    };

    // Set up a MutationObserver to watch for the button to be added to the DOM
    const observer = new MutationObserver(() => {
      attachListeners();
    });

    // Start observing the document body for DOM changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial check
    attachListeners();

    // Set a periodic check as a fallback
    const intervalId = setInterval(attachListeners, 1000);

    // Clean up event listeners and observer when component unmounts
    return () => {
      clearInterval(intervalId);
      observer.disconnect();
      processedButtons.forEach((button) => {
        (button as Element).removeEventListener("click", handleClick);
      });
    };
  }, [handleLeaveCall]);

  return (
    <div className="relative flex justify-center">
      <div className="relative z-10">
        <LiveKitControlBar {...controlBarProps} />
      </div>

      <button
        onClick={handleFindNewMatch}
        disabled={isRedirecting}
        className={cn(
          "absolute transform -translate-y-16 z-20 px-5 py-2.5",
          "bg-gradient-to-r from-[#A0FF00] to-[#7DDF00] text-black rounded-full font-semibold",
          "shadow-lg transition-all duration-200 ease-in-out",
          isRedirecting
            ? "opacity-50 cursor-not-allowed"
            : "hover:brightness-110 hover:shadow-xl active:scale-95"
        )}
      >
        {isRedirecting ? "Finding new match..." : "Find New Match"}
      </button>
    </div>
  );
}
