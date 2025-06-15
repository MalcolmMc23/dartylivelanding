"use client";

import { ControlBarProps } from "@livekit/components-react";
import { ControlBarContainer } from "./video/ControlBarContainer";
import { MediaControls } from "./room/MediaControls";
import { ChatButton } from "./room/ChatButton";
import { CallActionButtons } from "./room/CallActionButtons";
import { useRoomContext } from "@livekit/components-react";

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
  const room = useRoomContext();
  const currentUsername = room?.localParticipant?.identity;

  console.log('CustomControlBar debug:', {
    currentUsername,
    localParticipant: room?.localParticipant
  });

  // Render control buttons with safe defaults for removed props
  const controlButtons = (
    <>
      <MediaControls 
        isRedirecting={false} 
        currentUsername={currentUsername}
      />

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
