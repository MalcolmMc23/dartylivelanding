"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ControlBarProps,
  useRoomContext,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useRouter } from "next/navigation";
import { ControlButton } from "./ControlButton";
import { ControlBarContainer } from "./ControlBarContainer";
import {
  MicrophoneOnIcon,
  MicrophoneOffIcon,
  CameraOnIcon,
  CameraOffIcon,
  LeaveCallIcon,
} from "./LiveKitIcons";

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

    console.log(
      "Leave call proceeding, returning to search screen with reset flag"
    );

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

        // Redirect to the video-chat page with reset flag
        // Use a callback approach that will get handled by the VideoRoomManager
        const url = new URL("/video-chat", window.location.origin);
        url.searchParams.set("reset", "true");
        url.searchParams.set("username", username);
        router.push(url.toString());
      } catch (e) {
        console.error("Error initiating leave call:", e);
        // Still disconnect and redirect in case of error
        room.disconnect();
        const url = new URL("/video-chat", window.location.origin);
        url.searchParams.set("reset", "true");
        url.searchParams.set("username", username);
        router.push(url.toString());
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

  // Render control buttons
  const controlButtons = (
    <>
      {/* Mic Toggle Button */}
      <ControlButton
        onClick={toggleMicrophone}
        disabled={isRedirecting}
        active={isMicEnabled}
        ariaLabel={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        activeIcon={<MicrophoneOnIcon />}
        inactiveIcon={<MicrophoneOffIcon />}
      />

      {/* Camera Toggle Button */}
      <ControlButton
        onClick={toggleCamera}
        disabled={isRedirecting}
        active={isCameraEnabled}
        ariaLabel={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
        activeIcon={<CameraOnIcon />}
        inactiveIcon={<CameraOffIcon />}
      />

      {/* Leave Call Button */}
      <ControlButton
        onClick={handleLeaveCall}
        disabled={isRedirecting}
        active={false}
        activeColor="bg-red-600 hover:bg-red-700"
        inactiveColor="bg-red-600 hover:bg-red-700"
        ariaLabel="Leave call"
        activeIcon={<LeaveCallIcon />}
      />
    </>
  );

  return <ControlBarContainer controlButtons={controlButtons} />;
}
