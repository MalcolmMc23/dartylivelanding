"use client";

import { useEffect } from "react";
import { useConnectionState, useRoomContext } from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";

export function ConnectionStateLogger() {
  const connectionState = useConnectionState();
  const room = useRoomContext();

  useEffect(() => {
    console.log(`Connection state changed: ${connectionState}`);

    if (connectionState === ConnectionState.Connected) {
      console.log("Successfully connected to LiveKit room!");
      console.log(`Room name: ${room.name}`);
      console.log(`Local participant: ${room.localParticipant.identity}`);
    }

    // Set up event listeners for participants
    const onParticipantConnected = () => {
      console.log(`Participant connected to room: ${room.name}`);
    };

    const onParticipantDisconnected = () => {
      console.log(`Participant disconnected from room: ${room.name}`);
    };

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    // Clean up when the component unmounts
    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    };
  }, [connectionState, room]);

  // This component doesn't render anything
  return null;
}
