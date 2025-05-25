"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useConnectionState,
} from "@livekit/components-react";
import { Track, ConnectionState } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  SkipForward,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface SimpleRoomComponentProps {
  roomName: string;
  username: string;
  matchedWith: string;
  useDemo?: boolean;
  onDisconnect?: () => void;
  onSkip?: () => void;
  onLeave?: () => void;
}

interface MediaControlsProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSkip: () => void;
  onLeave: () => void;
  isLoading?: boolean;
}

function MediaControls({
  audioEnabled,
  videoEnabled,
  onToggleAudio,
  onToggleVideo,
  onSkip,
  onLeave,
  isLoading = false,
}: MediaControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3 p-4 bg-gray-900/80 backdrop-blur-sm">
      {/* Audio Toggle */}
      <Button
        onClick={onToggleAudio}
        variant="outline"
        size="lg"
        className={`w-12 h-12 rounded-full border-2 ${
          audioEnabled
            ? "bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
            : "bg-red-600 border-red-500 text-white hover:bg-red-700"
        }`}
      >
        {audioEnabled ? (
          <Mic className="w-5 h-5" />
        ) : (
          <MicOff className="w-5 h-5" />
        )}
      </Button>

      {/* Video Toggle */}
      <Button
        onClick={onToggleVideo}
        variant="outline"
        size="lg"
        className={`w-12 h-12 rounded-full border-2 ${
          videoEnabled
            ? "bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
            : "bg-red-600 border-red-500 text-white hover:bg-red-700"
        }`}
      >
        {videoEnabled ? (
          <Video className="w-5 h-5" />
        ) : (
          <VideoOff className="w-5 h-5" />
        )}
      </Button>

      {/* Skip Button */}
      <Button
        onClick={onSkip}
        disabled={isLoading}
        variant="outline"
        size="lg"
        className="w-12 h-12 rounded-full border-2 bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <SkipForward className="w-5 h-5" />
        )}
      </Button>

      {/* Leave Button */}
      <Button
        onClick={onLeave}
        disabled={isLoading}
        variant="outline"
        size="lg"
        className="w-12 h-12 rounded-full border-2 bg-red-600 border-red-500 text-white hover:bg-red-700"
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Phone className="w-5 h-5" />
        )}
      </Button>
    </div>
  );
}

function VideoDisplay({ username }: { username: string }) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.Microphone], {
    onlySubscribed: false,
  });
  const connectionState = useConnectionState();

  const localVideoTrack = tracks.find(
    (t) =>
      t.participant.identity === username && t.source === Track.Source.Camera
  );
  const remoteVideoTrack = tracks.find(
    (t) =>
      t.participant.identity !== username && t.source === Track.Source.Camera
  );

  if (connectionState === ConnectionState.Connecting) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-lg">Connecting to video chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-gray-900">
      {/* Remote Video (Main) */}
      <div className="w-full h-full">
        {remoteVideoTrack && remoteVideoTrack.publication?.track ? (
          <video
            ref={(video) => {
              if (video && remoteVideoTrack.publication?.track) {
                video.srcObject = new MediaStream([
                  remoteVideoTrack.publication.track.mediaStreamTrack,
                ]);
              }
            }}
            autoPlay
            playsInline
            muted={false}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            <div className="text-center">
              <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <VideoOff className="w-12 h-12" />
              </div>
              <p className="text-lg">Waiting for other person...</p>
            </div>
          </div>
        )}
      </div>

      {/* Local Video (Picture-in-Picture) */}
      <div className="absolute top-4 right-4 w-32 h-24 bg-gray-800 rounded-lg overflow-hidden border-2 border-white/20">
        {localVideoTrack && localVideoTrack.publication?.track ? (
          <video
            ref={(video) => {
              if (video && localVideoTrack.publication?.track) {
                video.srcObject = new MediaStream([
                  localVideoTrack.publication.track.mediaStreamTrack,
                ]);
              }
            }}
            autoPlay
            playsInline
            muted={true}
            className="w-full h-full object-cover scale-x-[-1]" // Mirror local video
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            <VideoOff className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
}

export function SimpleRoomComponent({
  roomName,
  username,
  matchedWith,
  useDemo = false,
  onDisconnect,
  onSkip,
  onLeave,
}: SimpleRoomComponentProps) {
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Get LiveKit token
  useEffect(() => {
    const getToken = async () => {
      try {
        setIsLoading(true);
        setError("");

        const response = await fetch(
          `/api/get-livekit-token?room=${encodeURIComponent(
            roomName
          )}&username=${encodeURIComponent(username)}&useDemo=${useDemo}`
        );

        if (!response.ok) {
          throw new Error(`Failed to get token: ${response.status}`);
        }

        const data = await response.json();
        setToken(data.token);
      } catch (err) {
        console.error("Error getting token:", err);
        setError(err instanceof Error ? err.message : "Failed to get token");
      } finally {
        setIsLoading(false);
      }
    };

    getToken();
  }, [roomName, username, useDemo]);

  const handleSkip = useCallback(async () => {
    setIsActionLoading(true);
    try {
      const response = await fetch("/api/simple-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "skip",
          username,
          otherUsername: matchedWith,
        }),
      });

      const result = await response.json();
      if (result.status === "skipped") {
        if (onSkip) onSkip();
        router.push("/simple-chat");
      } else {
        console.error("Skip failed:", result.error);
      }
    } catch (error) {
      console.error("Error skipping match:", error);
    } finally {
      setIsActionLoading(false);
    }
  }, [username, matchedWith, onSkip, router]);

  const handleLeave = useCallback(async () => {
    setIsActionLoading(true);
    try {
      const response = await fetch("/api/simple-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "leave",
          username,
          otherUsername: matchedWith,
        }),
      });

      const result = await response.json();
      if (result.status === "left") {
        if (onLeave) onLeave();
        router.push("/simple-chat");
      } else {
        console.error("Leave failed:", result.error);
      }
    } catch (error) {
      console.error("Error leaving match:", error);
    } finally {
      setIsActionLoading(false);
    }
  }, [username, matchedWith, onLeave, router]);

  const handleDisconnect = useCallback(() => {
    if (onDisconnect) onDisconnect();
    router.push("/simple-chat");
  }, [onDisconnect, router]);

  if (isLoading) {
    return (
      <Card className="w-full h-screen">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-lg">Connecting to room...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full h-screen">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-red-600 mb-4">Error: {error}</p>
            <Button onClick={() => router.push("/simple-chat")}>
              Back to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const liveKitUrl = useDemo
    ? process.env.NEXT_PUBLIC_LIVEKIT_DEMO_URL ||
      "wss://darty-live-landing-x5xpafcm.livekit.cloud"
    : process.env.NEXT_PUBLIC_LIVEKIT_URL ||
      "wss://darty-live-landing-x5xpafcm.livekit.cloud";

  return (
    <div className="w-full h-screen relative">
      <LiveKitRoom
        video={videoEnabled}
        audio={audioEnabled}
        token={token}
        serverUrl={liveKitUrl}
        data-lk-theme="default"
        style={{ height: "100vh" }}
        onDisconnected={handleDisconnect}
        onError={(error) => {
          console.error("LiveKit error:", error);
          setError(error.message);
        }}
      >
        {/* Audio Renderer */}
        <RoomAudioRenderer />

        {/* Video Display */}
        <VideoDisplay username={username} />

        {/* Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0">
          <MediaControls
            audioEnabled={audioEnabled}
            videoEnabled={videoEnabled}
            onToggleAudio={() => setAudioEnabled(!audioEnabled)}
            onToggleVideo={() => setVideoEnabled(!videoEnabled)}
            onSkip={handleSkip}
            onLeave={handleLeave}
            isLoading={isActionLoading}
          />
        </div>

        {/* Connection Info */}
        <div className="absolute top-4 left-4 bg-gray-900/80 backdrop-blur-sm text-white px-3 py-2 rounded-lg">
          <p className="text-sm">
            💬 Chatting with{" "}
            <span className="font-semibold">{matchedWith}</span>
          </p>
        </div>
      </LiveKitRoom>
    </div>
  );
}
