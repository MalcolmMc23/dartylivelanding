"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useConnectionState,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VideoCallProps } from "./types";

// Mock LiveKit server URL - replace with your actual LiveKit server
const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://your-livekit-server.com";

export default function VideoCall({
  accessToken,
  sessionId,
  onSkip,
  onEnd,
  onStateChange,
}: Omit<VideoCallProps, "roomName">) {
  const [isConnected, setIsConnected] = useState(false);
  const [showCountdown, setShowCountdown] = useState(true);
  const [countdown, setCountdown] = useState(3);

  // Show countdown before entering the call
  useEffect(() => {
    if (showCountdown && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setShowCountdown(false);
      onStateChange("IN_CALL");
    }
  }, [countdown, showCountdown, onStateChange]);

  const handleSkip = () => {
    onSkip();
  };

  const handleEnd = () => {
    onEnd();
  };

  if (showCountdown) {
    return <CountdownScreen countdown={countdown} sessionId={sessionId} />;
  }

  return (
    <div className="h-screen w-screen bg-black relative">
      <LiveKitRoom
        video={true}
        audio={true}
        token={accessToken}
        serverUrl={LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: "100vh" }}
        onConnected={() => setIsConnected(true)}
        onDisconnected={() => setIsConnected(false)}
      >
        <VideoConference />
        <RoomAudioRenderer />

        {/* Control Overlay */}
        <VideoControlOverlay
          isConnected={isConnected}
          onSkip={handleSkip}
          onEnd={handleEnd}
        />
      </LiveKitRoom>
    </div>
  );
}

// Connection Status component
function ConnectionStatus() {
  const connectionState = useConnectionState();

  if (connectionState === ConnectionState.Connected) {
    return null;
  }

  const getStatusMessage = () => {
    switch (connectionState) {
      case ConnectionState.Connecting:
        return "Connecting to video chat...";
      case ConnectionState.Reconnecting:
        return "Reconnecting...";
      case ConnectionState.Disconnected:
        return "Disconnected from video chat";
      default:
        return "Preparing video chat...";
    }
  };

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
      <Card className="bg-gray-900/90 border-gray-700 px-4 py-2">
        <div className="flex items-center space-x-2 text-white">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          <span className="text-sm">{getStatusMessage()}</span>
        </div>
      </Card>
    </div>
  );
}

// Countdown screen component
function CountdownScreen({
  countdown,
  sessionId,
}: {
  countdown: number;
  sessionId: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Match Found!</h2>
              <p className="text-gray-300">Starting video chat in...</p>
            </div>

            <div className="relative">
              <div className="w-32 h-32 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-gray-600"></div>
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-green-500 animate-spin"></div>
                <div className="text-6xl font-bold text-green-400">
                  {countdown}
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-400">
              Session ID: {sessionId.slice(-8)}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Control overlay component
function VideoControlOverlay({
  isConnected,
  onSkip,
  onEnd,
}: {
  isConnected: boolean;
  onSkip: () => void;
  onEnd: () => void;
}) {
  return (
    <>
      <ConnectionStatus />

      {/* Bottom Controls */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <div className="flex space-x-4">
          <Button
            onClick={onSkip}
            variant="outline"
            size="lg"
            className="bg-orange-600/90 hover:bg-orange-700 border-orange-500 text-white px-8"
            disabled={!isConnected}
          >
            Skip
          </Button>
          <Button
            onClick={onEnd}
            variant="outline"
            size="lg"
            className="bg-red-600/90 hover:bg-red-700 border-red-500 text-white px-8"
            disabled={!isConnected}
          >
            End Chat
          </Button>
        </div>
      </div>

      {/* Top Info */}
      <div className="absolute top-4 right-4 z-50">
        <Card className="bg-gray-900/90 border-gray-700 px-3 py-2">
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <span className="text-sm text-white">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}
