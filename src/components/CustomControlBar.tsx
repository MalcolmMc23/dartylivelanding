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
} from "./LiveKitIcons";
import {LucideMessageSquareMore} from 'lucide-react'
import {
  handleDisconnection,
  resetNavigationState,
} from "@/utils/disconnectionService";

interface CustomControlBarProps extends ControlBarProps {
  username: string;
  roomName: string;
  onChatClick: () => void;
  hasUnreadChat?: boolean;
  // className?: string; // Remove this line
  // hideChatButtonOnDesktop?: boolean; // Remove this line
}

export function CustomControlBar({
  username,
  roomName,
  onChatClick,
  hasUnreadChat = false,
  // className, // Remove this line
  // hideChatButtonOnDesktop = false, // Remove this line
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
    resetNavigationState();
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
      // Get the other participant's identity before leaving
      let otherParticipantIdentity: string | undefined;
      if (room.remoteParticipants.size === 1) {
        // There should be only one remote participant in a 1:1 call
        otherParticipantIdentity = Array.from(
          room.remoteParticipants.values()
        )[0].identity;
        console.log(`Found other participant: ${otherParticipantIdentity}`);
      }

      // Use the disconnection service
      try {
        await handleDisconnection({
          username,
          roomName,
          otherUsername: otherParticipantIdentity,
          reason: "user_left",
          router,
        });

        // Disconnect from the current room
        room.disconnect();
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

      {/* Chat Button: hide on desktop if requested */}
      <div className="block lg:hidden relative">
        <ControlButton
          onClick={onChatClick}
          disabled={isRedirecting}
          active={false}
          variant="chat"
          ariaLabel="Toggle chat"
          activeIcon={
            <LucideMessageSquareMore
              color="white"
              size={24}
              className="text-white"
            />
          }
          inactiveIcon={
            <LucideMessageSquareMore
              color="white"
              size={24}
              className="text-white"
            />
          }
        />
        {hasUnreadChat && (
          <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse z-10" />
        )}
      </div>

      {/* Leave Call Button */}
      <ControlButton
        onClick={handleLeaveCall}
        disabled={isRedirecting}
        active={false}
        activeColor="bg-gradient-to-br from-red-600 via-red-500 to-red-700 shadow-lg hover:scale-110"
        inactiveColor="bg-gradient-to-br from-red-600 via-red-500 to-red-700 shadow-lg hover:scale-110"
        ariaLabel="Leave call"
        activeIcon={
          <span
            className="font-extrabold text-xl md:text-2xl tracking-widest text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            style={{ letterSpacing: '0.15em', fontFamily: 'Inter, sans-serif' }}
          >
            END
          </span>
        }
        inactiveIcon={
          <span
            className="font-extrabold text-xl md:text-2xl tracking-widest text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            style={{ letterSpacing: '0.15em', fontFamily: 'Inter, sans-serif' }}
          >
            END
          </span>
        }
      />
    </>
  );

  return <ControlBarContainer controlButtons={controlButtons}/>;
}
