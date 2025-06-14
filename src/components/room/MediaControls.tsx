"use client";

import {
  MicrophoneOnIcon,
  MicrophoneOffIcon,
  CameraOnIcon,
  CameraOffIcon,
  FlagIcon,
} from "../video/LiveKitIcons";
import { ControlButton } from "../video/ControlButton";
import { useMediaControls } from "../hooks/useMediaControls";
import { useState } from "react";
import { ReportDialog } from "./ReportDialog";
import { useRoomContext } from "@livekit/components-react";

interface MediaControlsProps {
  isRedirecting: boolean;
}

export function MediaControls({ isRedirecting }: MediaControlsProps) {
  const { isCameraEnabled, isMicEnabled, toggleCamera, toggleMicrophone } =
    useMediaControls();
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const room = useRoomContext();

  // Get the other participant's ID and ensure it's a valid number
  const otherParticipantId = room?.remoteParticipants.size > 0
    ? (() => {
        const id = Array.from(room.remoteParticipants.values())[0].identity;
        // Extract numeric part from the ID (e.g., "user_123" -> 123)
        const numericId = parseInt(id.replace(/[^0-9]/g, ''));
        return isNaN(numericId) ? null : numericId;
      })()
    : null;

  console.log('Other participant ID:', otherParticipantId);

  return (
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

      {/* Report Button */}
      <ControlButton
        onClick={() => setIsReportDialogOpen(true)}
        disabled={isRedirecting || !otherParticipantId}
        active={false}
        ariaLabel="Report user"
        activeIcon={<FlagIcon />}
        inactiveIcon={<FlagIcon />}
      />

      <ReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        reportedUserId={otherParticipantId || 0}
      />
    </>
  );
}
