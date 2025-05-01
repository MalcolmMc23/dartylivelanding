"use client";

import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { ConnectionStateLogger } from "./room/ConnectionStateLogger";
import { LoadingIndicator } from "./room/LoadingIndicator";
import { ErrorDisplay } from "./room/ErrorDisplay";
import { RoomStatusIndicators } from "./room/RoomStatusIndicators";
import { useRoomConnection } from "./room/hooks/useRoomConnection";
import { CustomControlBar } from "./CustomControlBar";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useParticipants,
  useTracks,
  TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MirroredVideoTile } from "./room/MirroredVideoTile";

// Max participants allowed in a room
const MAX_PARTICIPANTS = 2;

interface RoomComponentProps {
  roomName: string;
  username: string;
  useDemo?: boolean;
}

export default function RoomComponent({
  roomName,
  username,
  useDemo = false,
}: RoomComponentProps) {
  const router = useRouter();
  const {
    token,
    error,
    isLoading,
    debugInfo,
    usingDemoServer,
    liveKitUrl,
    participantCount: initialParticipantCount,
    retryConnection,
    toggleDemoServer,
    handleOtherParticipantDisconnected,
  } = useRoomConnection({
    roomName,
    username,
    useDemo,
  });

  // We need a local state to track real-time participant count from LiveKit events
  const [liveParticipantCount, setLiveParticipantCount] = useState(
    initialParticipantCount
  );

  // Flag to track if unmount handling has been executed
  const unmountHandled = useRef(false);

  // Handle redirect when component unmounts
  useEffect(() => {
    return () => {
      // Prevent multiple redirects
      if (unmountHandled.current) {
        console.log("Unmount already handled, skipping redirect");
        return;
      }

      unmountHandled.current = true;
      console.log(
        "RoomComponent unmounting, redirecting to name entry page with reset flag"
      );

      // Redirect back to video chat page when user leaves the call
      // Add reset=true parameter to ensure state is cleared
      // Also preserve username to maintain input state
      const url = new URL("/video-chat", window.location.origin);
      url.searchParams.set("reset", "true");
      url.searchParams.set("username", username);
      router.push(url.toString());
    };
  }, [router, username]);

  if (error) {
    return (
      <ErrorDisplay
        error={error}
        debugInfo={debugInfo}
        usingDemoServer={usingDemoServer}
        retryConnection={retryConnection}
        toggleDemoServer={toggleDemoServer}
      />
    );
  }

  if (isLoading || !token) {
    return <LoadingIndicator />;
  }

  // Log environment variables (client-side only sees NEXT_PUBLIC_* vars)
  console.log(`LiveKit URL being used: ${liveKitUrl}`);

  return (
    <div className="w-full h-screen bg-[#0C0C0C] overflow-hidden">
      {token && liveKitUrl && (
        <LiveKitRoom
          token={token}
          serverUrl={liveKitUrl}
          connect={true}
          // Start with audio/video disabled to avoid permissions issues
          video={false}
          audio={false}
          onError={(err) => {
            console.error("LiveKit connection error:", err);
          }}
          data-lk-theme="default"
          className="h-full lk-video-conference"
        >
          <ConnectionStateLogger
            onParticipantCountChange={setLiveParticipantCount}
            maxParticipants={MAX_PARTICIPANTS}
            username={username}
            roomName={roomName}
            onOtherParticipantDisconnected={handleOtherParticipantDisconnected}
          />

          <div className="h-full flex flex-col relative">
            <RoomStatusIndicators
              usingDemoServer={usingDemoServer}
              participantCount={liveParticipantCount}
              maxParticipants={MAX_PARTICIPANTS}
            />

            <div className="flex-grow flex items-center justify-center">
              <VideoContainer />

              {/* Overlay when waiting alone in a call */}
              {liveParticipantCount === 1 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 pointer-events-none">
                  <div className="bg-blue-900 bg-opacity-80 p-6 rounded-lg max-w-md text-center">
                    <h2 className="text-xl font-bold text-white mb-4">
                      Looking for a new match...
                    </h2>
                    <p className="mb-4 text-white">
                      You are in the matching queue. Someone will join you soon.
                      Stay in this call.
                    </p>
                    <div className="flex justify-center">
                      <div className="animate-bounce mx-1 h-3 w-3 bg-white rounded-full"></div>
                      <div
                        className="animate-bounce mx-1 h-3 w-3 bg-white rounded-full"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                      <div
                        className="animate-bounce mx-1 h-3 w-3 bg-white rounded-full"
                        style={{ animationDelay: "0.4s" }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <RoomAudioRenderer />
            <div className="mb-4">
              <CustomControlBar username={username} roomName={roomName} />
            </div>
          </div>
        </LiveKitRoom>
      )}
    </div>
  );
}

// VideoContainer component to replace the missing VideoLayout
function VideoContainer() {
  const participants = useParticipants();
  const totalParticipants = participants.length + 1; // Including local participant

  // Get camera and screen share tracks
  const cameraTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [] }
  );

  if (totalParticipants === 1) {
    // Only local participant - centered large tile with prompt
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-4">
        <div className="w-full max-w-2xl aspect-video rounded-xl overflow-hidden border-2 border-[#212121] shadow-lg relative">
          {cameraTracks.length > 0 && (
            <>
              <MirroredVideoTile
                trackRef={cameraTracks[0]}
                className="h-full"
                style={{ aspectRatio: "16 / 9" }}
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 px-2 py-1 rounded-md text-white text-sm">
                You
              </div>
            </>
          )}
        </div>
        <div className="mt-6 text-gray-300 text-center">
          <p className="text-xl font-semibold mb-2">
            Waiting for someone to join...
          </p>
          <p className="text-sm opacity-75">
            Hang tight! You&apos;ll be connected with someone soon.
          </p>
        </div>
      </div>
    );
  }

  // Two participants - display side by side or stacked depending on screen width
  return (
    <div className="w-full h-full p-2 md:p-4 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4">
      {cameraTracks.map((track: TrackReferenceOrPlaceholder, index: number) => {
        // Get the participant's identity
        const participantIdentity =
          track.participant?.identity || (index === 0 ? "You" : "Participant");
        const isLocalParticipant = track.participant?.isLocal || false;

        return (
          <div
            key={track.publication?.trackSid || `participant-${index}`}
            className="w-full md:w-1/2 max-w-xl h-auto rounded-xl overflow-hidden border-2 border-[#212121] shadow-lg transition-all relative"
            style={{ aspectRatio: "16 / 9" }}
          >
            <MirroredVideoTile trackRef={track} className="h-full" />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 px-2 py-1 rounded-md text-white text-sm">
              {isLocalParticipant ? "You" : participantIdentity}
            </div>
          </div>
        );
      })}
    </div>
  );
}
