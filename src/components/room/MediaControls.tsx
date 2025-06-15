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
  currentUsername?: string;
}

export function MediaControls({ isRedirecting, currentUsername }: MediaControlsProps) {
  const { isCameraEnabled, isMicEnabled, toggleCamera, toggleMicrophone } =
    useMediaControls();
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const room = useRoomContext();

  // Get the other participant's username
  const otherParticipantUsername = room?.remoteParticipants.size > 0
    ? Array.from(room.remoteParticipants.values())[0].identity
    : null;

  console.log('MediaControls debug:', {
    currentUsername,
    otherParticipantUsername,
    remoteParticipantsCount: room?.remoteParticipants.size,
    remoteParticipants: Array.from(room?.remoteParticipants.values() || []).map(p => p.identity)
  });

  const handleReportSubmit = async (reason: string, description: string) => {
    if (!currentUsername || !otherParticipantUsername) {
      console.error('Cannot submit report: missing usernames', {
        currentUsername,
        otherParticipantUsername
      });
      return;
    }

    try {
      console.log('Submitting report:', {
        reporterUsername: currentUsername,
        reportedUsername: otherParticipantUsername,
        reason,
        description
      });

      const response = await fetch('/api/reports/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reporterUsername: currentUsername,
          reportedUsername: otherParticipantUsername,
          reason,
          description
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 403) {
          // Handle threshold reached errors
          throw new Error(data.error || 'Report threshold reached');
        }
        throw new Error(data.error || 'Failed to submit report');
      }

      console.log('Report submitted successfully:', data);
      setHasReported(true);
      setIsReportDialogOpen(false);
    } catch (error) {
      console.error('Error submitting report:', error);
      // Show error message to user
      alert(error instanceof Error ? error.message : 'Failed to submit report');
    }
  };

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
        disabled={isRedirecting || !otherParticipantUsername || !currentUsername || hasReported}
        active={false}
        ariaLabel={hasReported ? "Already reported this user" : "Report user"}
        activeIcon={<FlagIcon />}
        inactiveIcon={<FlagIcon />}
      />

      <ReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        onSubmit={handleReportSubmit}
      />
    </>
  );
}
