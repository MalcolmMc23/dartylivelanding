"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  ControlBar,
  useConnectionState,
  useRoomContext,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent, Participant } from "livekit-client";

interface RoomComponentProps {
  roomName: string;
  username: string;
}

// Connection state logging component
function ConnectionStateLogger() {
  const connectionState = useConnectionState();
  const room = useRoomContext();

  useEffect(() => {
    console.log(`Connection state changed: ${connectionState}`);

    if (connectionState === ConnectionState.Connected) {
      console.log("Successfully connected to LiveKit room!");
      console.log(`Room name: ${room.name}`);
      console.log(`Local participant: ${room.localParticipant.identity}`);
      console.log(`Total participants: ${room.numParticipants}`);
    }

    // Set up event listeners for participants
    const onParticipantConnected = (participant: Participant) => {
      console.log(`Participant connected: ${participant.identity}`);
      console.log(`Total participants now: ${room.numParticipants}`);
    };

    const onParticipantDisconnected = (participant: Participant) => {
      console.log(`Participant disconnected: ${participant.identity}`);
    };

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    };
  }, [connectionState, room]);

  return null;
}

export default function RoomComponent({
  roomName,
  username,
}: RoomComponentProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Fetch the LiveKit token from your API
    const getToken = async () => {
      console.log(
        `Attempting to get token for room: ${roomName}, user: ${username}`
      );
      try {
        const response = await fetch(
          `/api/get-livekit-token?room=${roomName}&username=${username}`
        );
        const data = await response.json();

        if (data.error) {
          console.error(`Token error: ${data.error}`);
          setError(`Failed to get token: ${data.error}`);
          return;
        }

        console.log("Successfully received token");
        setToken(data.token);
      } catch (error: unknown) {
        console.error("Failed to get token:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setError(`Error fetching token: ${errorMessage}`);
      }
    };

    getToken();
  }, [roomName, username]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#121212] text-white">
        <div className="p-6 bg-[#1E1E1E] rounded-lg max-w-md text-center">
          <h2 className="text-xl font-bold text-red-500 mb-4">
            Connection Error
          </h2>
          <p className="mb-4">{error}</p>
          <p className="text-sm text-gray-400">
            Check the browser console for more details
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#A0FF00]"></div>
      </div>
    );
  }

  console.log(
    `NEXT_PUBLIC_LIVEKIT_URL: ${
      process.env.NEXT_PUBLIC_LIVEKIT_URL || "not set"
    }`
  );

  return (
    <div className="w-full h-screen bg-[#121212]">
      <LiveKitRoom
        token={token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""}
        // Use connect only when token and URL are available
        connect={true}
        video={true}
        audio={true}
        onError={(err) => {
          console.error("LiveKit connection error:", err);
          setError(`LiveKit connection error: ${err.message}`);
        }}
      >
        <ConnectionStateLogger />
        <div className="h-full flex flex-col">
          <div className="flex-1 overflow-hidden">
            <VideoConference />
          </div>
          <ControlBar />
          <RoomAudioRenderer />
        </div>
      </LiveKitRoom>
    </div>
  );
}
