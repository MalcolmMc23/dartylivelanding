"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import {
  ControlBarProps,
  useRoomContext,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface CustomControlBarProps extends ControlBarProps {
  username: string;
  roomName: string;
}

export function CustomControlBar({
  username,
  roomName,
}: CustomControlBarProps) {
  const room = useRoomContext();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const navigationOccurred = useRef(false);

  const { localParticipant } = useLocalParticipant();

  const cameraPublication = localParticipant?.getTrackPublication(
    Track.Source.Camera
  );
  const microphonePublication = localParticipant?.getTrackPublication(
    Track.Source.Microphone
  );

  const isCameraEnabled = !!cameraPublication && !cameraPublication.isMuted;
  const isMicEnabled =
    !!microphonePublication && !microphonePublication.isMuted;

  const toggleCamera = useCallback(() => {
    if (localParticipant) {
      localParticipant.setCameraEnabled(!isCameraEnabled);
    }
  }, [localParticipant, isCameraEnabled]);

  const toggleMicrophone = useCallback(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!isMicEnabled);
    }
  }, [localParticipant, isMicEnabled]);

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
  const handleLeaveCall = useCallback(async () => {
    console.log("Leave call initiated, redirecting state:", isRedirecting);

    // If already redirecting or navigation occurred, do nothing
    if (isRedirecting || navigationOccurred.current) {
      console.log(
        "Already redirecting or navigation occurred, ignoring leave call"
      );
      return;
    }

    // Set the flags immediately to prevent multiple clicks
    setIsRedirecting(true);
    navigationOccurred.current = true;

    console.log("Leave call proceeding, returning to search screen");

    // Disconnect from the current room
    if (room) {
      // Notify the server that we're leaving
      try {
        const response = await fetch("/api/user-disconnect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            roomName,
            reason: "user_left",
          }),
        });

        const data = await response.json();
        console.log("Leave call response:", data);

        // Disconnect from the current room
        room.disconnect();

        // Redirect to video chat without auto-match parameters
        router.push(`/video-chat?username=${encodeURIComponent(username)}`);
      } catch (e) {
        console.error("Error initiating leave call:", e);
        // Still disconnect and redirect in case of error
        room.disconnect();
        router.push(`/video-chat?username=${encodeURIComponent(username)}`);
      }
    }
  }, [room, username, roomName, router, isRedirecting]);

  // Handle the "Find New Match" button click
  const handleFindNewMatch = useCallback(async () => {
    console.log("Find new match initiated, redirecting state:", isRedirecting);

    // If already redirecting or navigation occurred, do nothing
    if (isRedirecting || navigationOccurred.current) {
      console.log(
        "Already redirecting or navigation occurred, ignoring find new match"
      );
      return;
    }

    // Set the flags immediately to prevent multiple clicks
    setIsRedirecting(true);
    navigationOccurred.current = true;

    console.log("Find new match proceeding");

    // Disconnect from the current room
    if (room) {
      // Notify the server that we're looking for a new match
      try {
        const response = await fetch("/api/user-disconnect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            roomName,
            reason: "find_new_match",
          }),
        });

        const data = await response.json();
        console.log("Find new match response:", data);

        // Disconnect from the current room
        room.disconnect();

        // Redirect with autoMatch parameter to automatically start matching
        router.push(
          `/video-chat?autoMatch=true&username=${encodeURIComponent(username)}`
        );
      } catch (e) {
        console.error("Error initiating find new match:", e);
        // Still disconnect and redirect in case of error
        room.disconnect();
        router.push(
          `/video-chat?autoMatch=true&username=${encodeURIComponent(username)}`
        );
      }
    }
  }, [room, username, roomName, router, isRedirecting]);

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
    <div className="relative flex flex-col items-center">
      <div className="mb-4">
        <button
          onClick={handleFindNewMatch}
          disabled={isRedirecting}
          className={cn(
            "px-6 py-2 rounded-full bg-[#A0FF00] text-black font-medium hover:bg-opacity-90 transition-all shadow-md",
            isRedirecting && "opacity-50 cursor-not-allowed"
          )}
        >
          {isRedirecting ? "Finding..." : "Find New Match"}
        </button>
      </div>

      <div className="flex gap-4 p-4 bg-[#1A1A1A] rounded-full shadow-lg">
        {/* Mic Toggle Button */}
        <button
          onClick={toggleMicrophone}
          disabled={isRedirecting}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all",
            isMicEnabled
              ? "bg-gray-700 hover:bg-gray-600"
              : "bg-red-600 hover:bg-red-500"
          )}
          aria-label={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          {isMicEnabled ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" x2="12" y1="19" y2="22"></line>
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
              <line x1="12" x2="12" y1="19" y2="22"></line>
            </svg>
          )}
        </button>

        {/* Camera Toggle Button */}
        <button
          onClick={toggleCamera}
          disabled={isRedirecting}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all",
            isCameraEnabled
              ? "bg-gray-700 hover:bg-gray-600"
              : "bg-red-600 hover:bg-red-500"
          )}
          aria-label={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
        >
          {isCameraEnabled ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <path d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14v-4z"></path>
              <rect x="3" y="6" width="12" height="12" rx="2" ry="2"></rect>
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14v-4z"></path>
              <rect x="3" y="6" width="12" height="12" rx="2" ry="2"></rect>
            </svg>
          )}
        </button>

        {/* Leave Call Button */}
        <button
          onClick={handleLeaveCall}
          disabled={isRedirecting}
          className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-all"
          aria-label="Leave call"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white"
          >
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
            <line x1="23" y1="1" x2="1" y2="23"></line>
          </svg>
        </button>
      </div>
    </div>
  );
}
