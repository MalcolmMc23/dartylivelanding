"use client";

import {
  MicrophoneOnIcon,
  MicrophoneOffIcon,
  CameraOnIcon,
  CameraOffIcon,
} from "../LiveKitIcons";
import { ControlButton } from "../ControlButton";
import { useMediaControls } from "../hooks/useMediaControls";

interface MediaControlsProps {
  isRedirecting: boolean;
}

export function MediaControls({ isRedirecting }: MediaControlsProps) {
  const { isCameraEnabled, isMicEnabled, toggleCamera, toggleMicrophone } =
    useMediaControls();

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
    </>
  );
}
