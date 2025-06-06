"use client";

import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { CustomVideoConference } from "./CustomVideoConference";

interface LiveCallProps {
  token: string;
  sessionId: string;
  userId: string | null;
  onSkip: () => void;
  onEnd: () => void;
  onDisconnected: () => void;
  onError: (error: Error) => void;
  onConnected: () => void;
}

export function LiveCall({
  token,
  sessionId,
  userId,
  onSkip,
  onEnd,
  onDisconnected,
  onError,
  onConnected,
}: LiveCallProps) {
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
        onError={onError}
        onConnected={onConnected}
        connect={true}
        connectOptions={{
          autoSubscribe: true,
          maxRetries: 0,
          peerConnectionTimeout: 10000,
        }}
      >
        <CustomVideoConference onSkip={onSkip} onEnd={onEnd} />
        <style jsx global>{`
          .lk-disconnect-button {
            display: none !important;
          }
        `}</style>
      </LiveKitRoom>
    </div>
  );
}
