import { useCallback } from "react";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent } from "livekit-client";
import { CustomControlBar } from "@/components/CustomControlBar";
import { VideoConferenceProps } from "../types";

function VideoContent({ onSkip, onEnd }: { onSkip: () => void; onEnd: () => void }) {
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

export function VideoConference({ onSkip, onEnd, token, sessionId, userId, onDisconnected }: VideoConferenceProps) {
  return (
    <div style={{ height: "100vh" }}>
      <div className="absolute top-4 left-4 z-50 bg-black/80 text-white p-2 rounded text-xs">
        <div>State: IN_CALL</div>
        <div>Session: {sessionId}</div>
        <div>User: {userId}</div>
      </div>
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: "100%" }}
        onDisconnected={onDisconnected}
        onError={(error: Error) => {
          console.error("LiveKit error:", error);
        }}
        connect={true}
        connectOptions={{
          autoSubscribe: true,
          maxRetries: 0,
          peerConnectionTimeout: 10000,
        }}
      >
        <VideoContent onSkip={onSkip} onEnd={onEnd} />
        <style jsx global>{`
          .lk-disconnect-button {
            display: none !important;
          }
        `}</style>
      </LiveKitRoom>
    </div>
  );
} 