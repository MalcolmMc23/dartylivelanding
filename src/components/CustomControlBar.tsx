"use client";

import { useEffect } from "react";
import { ControlBarProps } from "@livekit/components-react";
import { ControlBarContainer } from "./ControlBarContainer";
import { MediaControls } from "./room/MediaControls";
import { ChatButton } from "./room/ChatButton";
import { CallActionButtons } from "./room/CallActionButtons";
import { LeaveButtonOverrideEffect } from "./room/LeaveButtonOverrideEffect";
import { useRoomActions } from "./hooks/useRoomActions";

interface CustomControlBarProps extends ControlBarProps {
  username: string;
  roomName: string;
  onChatClick: () => void;
  hasUnreadChat?: boolean;
}

export function CustomControlBar({
  username,
  roomName,
  onChatClick,
  hasUnreadChat = false,
}: CustomControlBarProps) {
  const {
    isRedirecting,
    resetRedirectingState,
    handleLeaveCall,
    handleEndCall,
    room,
  } = useRoomActions({ username, roomName });

  // Reset the redirecting state when the component mounts or when username/roomName changes
  useEffect(() => {
    resetRedirectingState();
  }, [username, roomName, resetRedirectingState]);

  // Handle disconnection cleanup
  useEffect(() => {
    return () => {
      if (room && room.state === "connected") {
        console.log("Component unmounting while connected, disconnecting...");
        room.disconnect();
      }
    };
  }, [room]);

  // Render control buttons
  const controlButtons = (
    <>
      <MediaControls isRedirecting={isRedirecting} />

      <ChatButton
        onChatClick={onChatClick}
        hasUnreadChat={hasUnreadChat}
        isRedirecting={isRedirecting}
      />

      <CallActionButtons
        onSkip={handleLeaveCall}
        onEnd={handleEndCall}
        isRedirecting={isRedirecting}
      />

      <LeaveButtonOverrideEffect onLeaveButtonClick={handleLeaveCall} />
    </>
  );

  return <ControlBarContainer controlButtons={controlButtons} />;
}
