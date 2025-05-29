"use client";

import { ControlBarProps } from "@livekit/components-react";
import { ControlBarContainer } from "./ControlBarContainer";
import { MediaControls } from "./room/MediaControls";
import { ChatButton } from "./room/ChatButton";
import { CallActionButtons } from "./room/CallActionButtons";
import { LeaveButtonOverrideEffect } from "./room/LeaveButtonOverrideEffect";

interface CustomControlBarProps extends ControlBarProps {
  onChatClick: () => void;
  hasUnreadChat?: boolean;
}

export function CustomControlBar({
  onChatClick,
  hasUnreadChat = false,
}: CustomControlBarProps) {
  // Removed useRoomActions-related logic

  // Render control buttons with safe defaults for removed props
  const controlButtons = (
    <>
      <MediaControls isRedirecting={false} />

      <ChatButton
        onChatClick={onChatClick}
        hasUnreadChat={hasUnreadChat}
        isRedirecting={false}
      />

      <CallActionButtons
        onSkip={() => {}}
        onEnd={() => {}}
        isRedirecting={false}
      />

      <LeaveButtonOverrideEffect onLeaveButtonClick={() => {}} />
    </>
  );

  return <ControlBarContainer controlButtons={controlButtons} />;
}
