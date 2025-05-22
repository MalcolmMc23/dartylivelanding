"use client";

import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { LoadingIndicator } from "./room/LoadingIndicator";
import { ErrorDisplay } from "./room/ErrorDisplay";
import { RoomStatusIndicators } from "./room/RoomStatusIndicators";
import { useRoomConnection } from "./room/hooks/useRoomConnection";
import { CustomControlBar } from "./CustomControlBar";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StableRoomConnector } from "./StableRoomConnector";
import { RoomAutoMatchRedirector } from "./RoomAutoMatchRedirector";
import { ActiveMatchPoller } from "./ActiveMatchPoller";
import { handleDisconnection } from "@/utils/disconnectionService";
import { LeftBehindNotification } from "./LeftBehindNotification";
import { ParticipantCounter } from "./ParticipantCounter";
import { VideoContainer } from "./room/VideoContainer";
import { WaitingOverlay } from "./room/WaitingOverlay";
import { MobileViewToggle } from "./room/MobileViewToggle";
import { ChatDialog } from "./ChatDialog";
import { DesktopChat } from "./DesktopChat"; // <-- Add this import
import UniversityLogoScroll from "./UniversityLogoScroll";

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
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false); // NEW STATE

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

  const handleNewChatMessage = useCallback(() => {
    if (!isChatOpen) {
      setHasUnreadChat(true);
    }
  }, [isChatOpen]);

  // Clear unread chat when dialog is opened
  useEffect(() => {
    if (isChatOpen) {
      setHasUnreadChat(false);
    }
  }, [isChatOpen]);

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
    <div
      className="
        h-screen
        md:h-full md:min-h-screen
        pb-20 md:pb-0
        relative
        overflow-hidden
      "
    >
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
            // otherParticipantLeft={otherParticipantLeft}
          />

          <div className="h-full flex flex-col relative">
            <RoomStatusIndicators
              usingDemoServer={usingDemoServer}
              participantCount={liveParticipantCount}
              maxParticipants={MAX_PARTICIPANTS}
            />

            <MobileViewToggle
              mobileView={mobileView}
              setMobileView={setMobileView}
            />

            {/* Show WaitingOverlay above video container */}
            {liveParticipantCount === 1 && (
              <div className="flex justify-center items-center w-full">
                <UniversityLogoScroll />
              </div>
            )}

            <div className="flex items-center justify-center">
              {/* Videos on the left */}
              <div
                className={`w-[75vw] h-[75vh] max-w-[75vw] max-h-[75vh] flex items-center justify-center mx-auto lg:my-8 ${
                  mobileView === "chat" ? "hidden" : "block"
                } md:block`}
              >
                <div className="aspect-[16/9] w-full h-full max-w-full max-h-full flex items-center justify-center">
                  <VideoContainer otherParticipantLeft={otherParticipantLeft} />
                </div>
              </div>
            </div>
            
            {/* CustomControlBar: hide chat button on large screens */}
            <CustomControlBar
              username={username}
              roomName={roomName}
              onChatClick={() => setIsChatOpen(true)}
              hasUnreadChat={hasUnreadChat}
              // className="fixed left-1/2 -translate-x-1/2 z-50 bottom-0 md:bottom-8"
              // hideChatButtonOnDesktop={false}
            />

            {/* ChatDialog: modal on mobile, DesktopChat on desktop */}
            {/* Show ChatDialog on screens smaller than lg */}
            <div className="block lg:hidden">
              <ChatDialog
                username={username}
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                onNewMessage={handleNewChatMessage}
              />
            </div>
            {/* Show DesktopChat only on lg and up */}
            <div className="hidden lg:block">
              <div className="fixed right-8 top-1/2 -translate-y-1/2 z-40 w-[350px] max-w-[90vw]">
                <DesktopChat
                  username={username}
                  onNewMessage={handleNewChatMessage}
                />
              </div>
            </div>
            <RoomAudioRenderer />
          </div>
        </LiveKitRoom>
      )}
    </div>
  );
}
