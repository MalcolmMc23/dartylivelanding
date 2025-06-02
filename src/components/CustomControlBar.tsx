"use client";

import { ControlBarProps } from "@livekit/components-react";
import { ControlBarContainer } from "./ControlBarContainer";
import { MediaControls } from "./room/MediaControls";
import { ChatButton } from "./room/ChatButton";
import { CallActionButtons } from "./room/CallActionButtons";

interface CustomControlBarProps extends ControlBarProps {
  onChatClick: () => void;
  hasUnreadChat?: boolean;
  onSkip?: () => void;
  onEnd?: () => void;
}

export function CustomControlBar({
  onChatClick,
  hasUnreadChat = false,
  onSkip,
  onEnd,
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
        onSkip={onSkip || (() => {})}
        onEnd={onEnd || (() => {})}
        isRedirecting={false}
      />
    </>
  );

  return <ControlBarContainer controlButtons={controlButtons} />;
}
