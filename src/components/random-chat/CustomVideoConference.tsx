"use client";

import { useCallback } from "react";
import {
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { CustomControlBar } from "@/components/CustomControlBar";

interface CustomVideoConferenceProps {
  onSkip: () => void;
  onEnd: () => void;
}

export function CustomVideoConference({
  onSkip,
  onEnd,
}: CustomVideoConferenceProps) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const handleSkip = useCallback(() => {
    onSkip();
  }, [onSkip]);

  const handleEnd = useCallback(() => {
    onEnd();
  }, [onEnd]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <GridLayout tracks={tracks} style={{ height: "calc(100vh - 80px)" }}>
        <ParticipantTile />
      </GridLayout>
      <CustomControlBar
        onChatClick={() => {}}
        hasUnreadChat={false}
        onSkip={handleSkip}
        onEnd={handleEnd}
      />
      <RoomAudioRenderer />
    </div>
  );
}
