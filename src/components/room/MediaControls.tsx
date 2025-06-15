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
import { useState, useEffect } from "react";
import { ReportDialog } from "./ReportDialog";
import { useRoomContext } from "@livekit/components-react";
import { api } from "../../app/random-chat/utils/api";

interface MediaControlsProps {
  isRedirecting: boolean;
  currentUsername?: string;
}

export function MediaControls({ isRedirecting, currentUsername }: MediaControlsProps) {
  const { isCameraEnabled, isMicEnabled, toggleCamera, toggleMicrophone } =
    useMediaControls();
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [isInTimeout, setIsInTimeout] = useState(false);
  const room = useRoomContext();

  // Get the other participant's username
  const otherParticipantUsername = room?.remoteParticipants.size > 0
    ? Array.from(room.remoteParticipants.values())[0].identity
    : null;

  // Check user status when component mounts or username changes
  useEffect(() => {
    const checkUserStatus = async () => {
      if (!currentUsername) return;

      try {
        const response = await fetch('/api/reports/check-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: currentUsername
          }),
        });

        const data = await response.json();
        
        if (response.ok) {
          setIsInTimeout(data.isTimeout);
        } else {
          console.error('Failed to check user status:', data.error);
        }
      } catch (error) {
        console.error('Error checking user status:', error);
      }
    };

    checkUserStatus();
  }, [currentUsername]);

  console.log('MediaControls debug:', {
    currentUsername,
    otherParticipantUsername,
    remoteParticipantsCount: room?.remoteParticipants.size,
    remoteParticipants: Array.from(room?.remoteParticipants.values() || []).map(p => p.identity),
    isInTimeout
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

      // check to see if alert is necessary
      const totalReported: number = data.totalReported;
      if (totalReported >= 5 && otherParticipantUsername != null) {
        const alertResponse = await api.sendReportedAlert(otherParticipantUsername, totalReported);
        console.log(alertResponse.message);
      }

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
        disabled={isRedirecting || !otherParticipantUsername || !currentUsername || hasReported || isInTimeout}
        active={false}
        ariaLabel={isInTimeout ? "You are in timeout" : hasReported ? "Already reported this user" : "Report user"}
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
