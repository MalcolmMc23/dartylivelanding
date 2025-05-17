"use client";

import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { LoadingIndicator } from "./room/LoadingIndicator";
import { ErrorDisplay } from "./room/ErrorDisplay";
import { RoomStatusIndicators } from "./room/RoomStatusIndicators";
import { useRoomConnection } from "./room/hooks/useRoomConnection";
import { CustomControlBar } from "./CustomControlBar";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useParticipants,
  useTracks,
  TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MirroredVideoTile } from "./room/MirroredVideoTile";
import { ChatComponent } from "./ChatComponent";
import { StableRoomConnector } from "./StableRoomConnector";
import { RoomAutoMatchRedirector } from "./RoomAutoMatchRedirector";
import { ActiveMatchPoller } from "./ActiveMatchPoller";
import { handleDisconnection } from "@/utils/disconnectionService";
import { LeftBehindNotification } from "./LeftBehindNotification";
import { ParticipantCounter } from "./ParticipantCounter";

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
  const [otherParticipantLeft, setOtherParticipantLeft] = useState(false);
  const [wasLeftBehind, setWasLeftBehind] = useState(false);

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

  // Handler for when the user needs to join a new room (after being left behind)
  const handleJoinNewRoom = useCallback(
    (newRoomName: string) => {
      console.log(`Redirecting left-behind user to new room: ${newRoomName}`);

      // Navigate to the new room
      router.push(
        `/video-chat/room/${encodeURIComponent(
          newRoomName
        )}?username=${encodeURIComponent(username)}`
      );
    },
    [router, username]
  );

  // We need a local state to track real-time participant count from LiveKit events
  const [liveParticipantCount, setLiveParticipantCount] = useState(
    initialParticipantCount
  );

  // Use ref to track initial connection period
  const isInitialConnectionPeriod = useRef(true);
  const initialConnectionTimeout = useRef<NodeJS.Timeout | null>(null);

  // Set a connection stabilization period
  useEffect(() => {
    // Mark the first 10 seconds as an initial connection period
    // During this time, we'll ignore disconnection events
    isInitialConnectionPeriod.current = true;

    // Clear the connection period after 10 seconds
    initialConnectionTimeout.current = setTimeout(() => {
      console.log("Initial connection stabilization period ended");
      isInitialConnectionPeriod.current = false;
    }, 10000); // Increased from 5000 to 10000 ms

    return () => {
      if (initialConnectionTimeout.current) {
        clearTimeout(initialConnectionTimeout.current);
      }
    };
  }, [roomName]);

  // Handle redirect when component unmounts
  useEffect(() => {
    return () => {
      // Skip redirect during initial connection period to prevent flashing
      if (isInitialConnectionPeriod.current) {
        console.log("In initial connection period, skipping redirect");
        return;
      }

      // Skip redirect if other participant left (let the RoomAutoMatchRedirector handle it)
      if (otherParticipantLeft) {
        console.log(
          "Other participant left, RoomAutoMatchRedirector will handle redirect"
        );
        return;
      }

      console.log(
        "RoomComponent unmounting, redirecting to name entry page with reset flag"
      );

      // Use disconnection service for unmounting
      handleDisconnection({
        username,
        roomName,
        reason: "component_cleanup",
        router,
      }).catch((err) => console.error("Error during unmount disconnect:", err));
    };
  }, [router, username, roomName, otherParticipantLeft]);

  // When a participant disconnects, handle cleanup and navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      // If this component is being unloaded due to navigation or page close,
      // make sure we notify about the disconnection
      handleDisconnection({
        username,
        roomName,
        reason: "browser_closed",
        // Can't use router here as the page is unloading
      }).catch((err) => console.error("Error sending disconnect:", err));

      // Call onDisconnect callback if provided
      if (onDisconnect) {
        onDisconnect();
      }
    };

    // Add event listener for page unload
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [username, roomName, onDisconnect]);

  // Memoize callbacks to prevent them from changing on every render
  const handleLiveKitError = useCallback((err: Error) => {
    console.error("LiveKit connection error:", err);
    // Only handle fatal errors after initial connection period
    if (!isInitialConnectionPeriod.current) {
      console.error("Fatal LiveKit error, will need to reconnect");
    } else {
      console.log("Ignoring LiveKit error during initial connection period");
    }
  }, []);

  const handleLiveKitConnected = useCallback(() => {
    console.log("LiveKit connected successfully");
    // We're connected - we can consider this a stable connection point
    setTimeout(() => {
      isInitialConnectionPeriod.current = false;
      console.log("LiveKit connection now considered stable");
    }, 2000);
  }, []);

  const handleLiveKitDisconnected = useCallback(() => {
    console.log("LiveKit disconnected");
    // Ignore disconnections during initial connection period
    if (isInitialConnectionPeriod.current) {
      console.log("Ignoring disconnection during initial connection period");
      return;
    }

    // Check if we should skip disconnection (set by StableRoomConnector)
    const shouldSkipDisconnect =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem("skipDisconnect") === "true";

    if (shouldSkipDisconnect) {
      console.log(
        "Ignoring LiveKit disconnection due to navigation (skipDisconnect flag is set)"
      );
    }
  }, []);

  // Custom handler for when the other participant disconnects
  const handleOtherParticipantLeftRoom = useCallback(
    (otherUsername: string) => {
      console.log(
        `Other participant ${otherUsername} left the room - will trigger auto-match`
      );

      // Set the flag that will trigger our redirector component
      setOtherParticipantLeft(true);

      // Mark this user as being left behind for the ActiveMatchPoller
      setWasLeftBehind(true);

      // Still call the original handler which notifies the server
      handleOtherParticipantDisconnected(otherUsername);
    },
    [handleOtherParticipantDisconnected]
  );

  // Memoize LiveKitRoom options to prevent re-renders
  const liveKitOptions = useMemo(
    () => ({
      token,
      serverUrl: liveKitUrl,
      connect: true,
      video: false,
      audio: false,
    }),
    [token, liveKitUrl]
  );

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
    <div className="relative h-full">
      {/* Add the ActiveMatchPoller when user is left behind */}
      {wasLeftBehind && (
        <ActiveMatchPoller
          username={username}
          isLeftBehind={wasLeftBehind}
          useDemo={usingDemoServer}
        />
      )}

      {/* Redirect to auto-match if other participant left */}
      {otherParticipantLeft && (
        <RoomAutoMatchRedirector
          username={username}
          roomName={roomName}
          otherParticipantLeft={otherParticipantLeft}
        />
      )}

      {token && liveKitUrl && (
        <LiveKitRoom
          {...liveKitOptions}
          onError={handleLiveKitError}
          onConnected={handleLiveKitConnected}
          onDisconnected={handleLiveKitDisconnected}
          data-lk-theme="default"
          className="h-full lk-video-conference"
        >
          <LeftBehindNotification
            username={username}
            onJoinNewRoom={handleJoinNewRoom}
          />
          <StableRoomConnector username={username} roomName={roomName} />
          {/* Improved participant counter with detailed diagnostics */}
          <ParticipantCounter onCountChange={setLiveParticipantCount} />
          <RoomStatusIndicators
            usingDemoServer={usingDemoServer}
            participantCount={liveParticipantCount}
            maxParticipants={MAX_PARTICIPANTS}
            onParticipantLeft={handleOtherParticipantLeftRoom}
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

  // Track render count to help debug infinite renders
  const renderCount = useRef(0);
  useEffect(() => {
    renderCount.current += 1;
    console.log(`VideoContainer rendered: ${renderCount.current} times`);
  }, []);

  // Get camera and screen share tracks with useMemo to prevent unnecessary processing
  const trackSources = useMemo(
    () => [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    []
  );

  // Memoize the options object to prevent it from causing re-renders
  const trackOptions = useMemo(
    () => ({
      updateOnlyOn: [],
      onlySubscribed: false,
    }),
    []
  );

  const cameraTracks = useTracks(trackSources, trackOptions);

  // Memoize the rendered tracks to prevent unnecessary re-renders
  const renderedTracks = useMemo(() => {
    console.log("Rendering tracks:", cameraTracks.length);
    return cameraTracks.map(
      (track: TrackReferenceOrPlaceholder, index: number) => {
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
      }
    );
  }, [cameraTracks]); // Only depend on cameraTracks

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
      {renderedTracks}
    </div>
  );
}
