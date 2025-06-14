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

interface MediaControlsProps {
  isRedirecting: boolean;
}

export function MediaControls({ isRedirecting }: MediaControlsProps) {
  const { isCameraEnabled, isMicEnabled, toggleCamera, toggleMicrophone } =
    useMediaControls();
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

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
        disabled={isRedirecting}
        active={false}
        ariaLabel="Report user"
        activeIcon={<FlagIcon />}
        inactiveIcon={<FlagIcon />}
      />

      <ReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
      />
    </>
  );
}
