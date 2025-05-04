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
import { ChatComponent } from "./ChatComponent";

// Max participants allowed in a room
const MAX_PARTICIPANTS = 2;

interface RoomComponentProps {
  roomName: string;
  username: string;
  useDemo?: boolean;
  onDisconnect?: () => void;
}

export default function RoomComponent({
  roomName,
  username,
  useDemo = false,
  onDisconnect,
}: RoomComponentProps) {
  const router = useRouter();
  const [mobileView, setMobileView] = useState<"video" | "chat">("video");
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

  // When a participant disconnects, handle cleanup and navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      // If this component is being unloaded due to navigation or page close,
      // make sure we notify about the disconnection
      if (onDisconnect) {
        fetch("/api/user-disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            roomName,
            reason: "browser_closed",
          }),
          keepalive: true,
        }).catch((err) => console.error("Error sending disconnect:", err));
      }
    };

    // Add event listener for page unload
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [username, roomName, onDisconnect]);

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

            {/* Mobile view toggle - only visible on small screens */}
            <div className="md:hidden flex justify-center p-2 bg-[#1A1A1A] border-b border-[#2A2A2A]">
              <div className="inline-flex rounded-md shadow-sm" role="group">
                <button
                  onClick={() => setMobileView("video")}
                  className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                    mobileView === "video"
                      ? "bg-[#A0FF00] text-black"
                      : "bg-[#2A2A2A] text-white hover:bg-[#3A3A3A]"
                  }`}
                >
                  Video
                </button>
                <button
                  onClick={() => setMobileView("chat")}
                  className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                    mobileView === "chat"
                      ? "bg-[#A0FF00] text-black"
                      : "bg-[#2A2A2A] text-white hover:bg-[#3A3A3A]"
                  }`}
                >
                  Chat
                </button>
              </div>
            </div>

            {/* Main content area with videos on left, chat on right */}
            <div className="flex-grow flex h-full pb-16">
              {/* Videos on the left */}
              <div
                className={`w-full md:w-3/5 h-full overflow-y-auto flex items-center justify-center ${
                  mobileView === "chat" ? "hidden" : "block"
                } md:block`}
              >
                <VideoContainer />

                {/* Overlay when waiting alone in a call */}
                {liveParticipantCount === 1 && (
                  <div className="absolute inset-0 md:w-3/5 flex items-center justify-center bg-black bg-opacity-50 pointer-events-none">
                    <div className="bg-blue-900 bg-opacity-80 p-6 rounded-lg max-w-md text-center">
                      <h2 className="text-xl font-bold text-white mb-4">
                        Looking for a new match...
                      </h2>
                      <p className="mb-4 text-white">
                        You are in the matching queue. Someone will join you
                        soon. Stay in this call.
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

              {/* Chat on the right */}
              <div
                className={`w-full md:w-2/5 h-full ${
                  mobileView === "video" ? "hidden" : "block"
                } md:block`}
              >
                <ChatComponent username={username} roomName={roomName} />
              </div>
            </div>

            <RoomAudioRenderer />
            <div className="fixed bottom-4 md:bottom-6 left-0 md:left-[30%] transform md:translate-x-[-50%] right-0 md:right-auto z-50">
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
        <div className="w-full max-w-lg aspect-video rounded-xl overflow-hidden border-2 border-[#212121] shadow-lg relative">
          {cameraTracks.length > 0 && (
            <>
              <MirroredVideoTile
                trackRef={cameraTracks[0]}
                className="h-full"
                style={{ aspectRatio: "16 / 9" }}
              />
              {/* Custom participant name tag */}
              <div
                className="absolute bottom-6 left-6 bg-black bg-opacity-80 px-4 py-2 rounded-md text-white text-base font-medium z-20 shadow-md"
                id="custom-name-tag-local"
              >
                You
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Two participants - stacked vertically (one on top of the other)
  return (
    <div className="w-full p-2 md:p-4 flex flex-col items-center justify-center gap-3 md:gap-6">
      {cameraTracks.map((track: TrackReferenceOrPlaceholder, index: number) => {
        // Get the participant's identity
        const participantIdentity =
          track.participant?.identity || (index === 0 ? "You" : "Participant");
        const isLocalParticipant = track.participant?.isLocal || false;

        return (
          <div
            key={track.publication?.trackSid || `participant-${index}`}
            className="w-full max-w-lg h-auto rounded-xl overflow-hidden border-2 border-[#212121] shadow-lg transition-all relative"
            style={{ aspectRatio: "16 / 9" }}
          >
            <MirroredVideoTile trackRef={track} className="h-full" />
            {/* Custom participant name tag */}
            <div
              className="absolute bottom-6 left-6 bg-black bg-opacity-80 px-4 py-2 rounded-md text-white text-base font-medium z-20 shadow-md"
              id={`custom-name-tag-${
                isLocalParticipant ? "local" : track.participant?.identity
              }`}
            >
              {isLocalParticipant ? "You" : participantIdentity}
            </div>
          </div>
        );
      })}
    </div>
  );
}
