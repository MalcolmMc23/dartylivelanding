"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useConnectionState, useRoomContext } from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  Participant,
  RemoteParticipant,
} from "livekit-client";
import { handleDisconnection } from "@/utils/disconnectionService";

interface ConnectionStateLoggerProps {
  onParticipantCountChange: (count: number) => void;
  maxParticipants: number;
  username: string;
  roomName: string;
  onOtherParticipantDisconnected: (otherUsername: string) => void;
}

// Import the helper function for cleaning up room tracking
// We use fetch here since we can't directly import from API routes in components
const cleanupRoomTracking = async (username: string, roomName: string) => {
  try {
    await handleDisconnection({
      username,
      roomName,
      reason: "component_cleanup",
    });
    console.log(
      `Sent cleanup request for user ${username} in room ${roomName}`
    );
  } catch (error) {
    console.error("Failed to send cleanup request:", error);
  }
};

export function ConnectionStateLogger({
  onParticipantCountChange,
  maxParticipants,
  username,
  roomName,
  onOtherParticipantDisconnected,
}: ConnectionStateLoggerProps) {
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const [isRoomFull, setIsRoomFull] = useState(false);
  const previousParticipantCountRef = useRef(0);
  const otherParticipantsRef = useRef<string[]>([]);
  // Track if we've already triggered a participant disconnect action
  const hasTriggeredDisconnectAction = useRef(false);
  // Use Ref to track the connection establishment time
  const connectionEstablishedAt = useRef<number | null>(null);
  // Track when the connection is stable (connected with another participant)
  const isStableConnection = useRef(false);

  // Reset the disconnect action flag when the component mounts or roomName changes
  useEffect(() => {
    hasTriggeredDisconnectAction.current = false;
    connectionEstablishedAt.current = null;
    isStableConnection.current = false;
    return () => {
      // Clean up when component unmounts
      hasTriggeredDisconnectAction.current = false;
    };
  }, [roomName, username]);

  // Function to check if room is at capacity
  const checkRoomCapacity = useCallback(() => {
    const participantCount = room.remoteParticipants.size + 1; // +1 for local participant
    console.log(
      `Room capacity check: ${participantCount}/${maxParticipants} participants`
    );

    const participantList = Array.from(room.remoteParticipants.values()).map(
      (p: RemoteParticipant) => p.identity
    );

    // Store in ref instead of state to avoid re-renders
    otherParticipantsRef.current = participantList;

    console.log("Current participants:", [
      room.localParticipant.identity,
      ...participantList,
    ]);

    onParticipantCountChange(participantCount);

    // Mark the connection as stable when we have 2 participants
    if (participantCount === 2 && !isStableConnection.current) {
      console.log("Connection is now stable with 2 participants");
      isStableConnection.current = true;
    }

    // For auto-matching, we need to detect when a participant leaves
    const hadOtherParticipant = previousParticipantCountRef.current === 2;
    const nowAlone = participantCount === 1;

    if (
      hadOtherParticipant &&
      nowAlone &&
      !hasTriggeredDisconnectAction.current &&
      isStableConnection.current // Only trigger if we had a stable connection
    ) {
      console.log(
        "Other participant has disconnected - will look for new match"
      );

      // Set the flag to prevent multiple triggers
      hasTriggeredDisconnectAction.current = true;

      // Add grace period before handling disconnection
      setTimeout(() => {
        // Call the function to handle the other participant disconnecting
        if (otherParticipantsRef.current.length > 0) {
          onOtherParticipantDisconnected(otherParticipantsRef.current[0]);
        }
      }, 3000); // 3-second grace period
    }

    previousParticipantCountRef.current = participantCount;

    // Room is full if we have more than the max allowed participants
    // and we're not already in the list (to handle reconnections)
    if (participantCount > maxParticipants) {
      console.log("Room is over capacity!");
      setIsRoomFull(true);

      // Determine if we should disconnect (we're the newest participant)
      const shouldDisconnect = !participantList.includes(username);
      if (shouldDisconnect && !hasTriggeredDisconnectAction.current) {
        console.log("We appear to be the newest participant, disconnecting");
        hasTriggeredDisconnectAction.current = true;
        room.disconnect();
      }
    } else {
      setIsRoomFull(false);
    }
  }, [
    room,
    maxParticipants,
    onParticipantCountChange,
    username,
    onOtherParticipantDisconnected,
  ]);

  useEffect(() => {
    console.log(`Connection state changed: ${connectionState}`);

    if (connectionState === ConnectionState.Connected) {
      console.log("Successfully connected to LiveKit room!");
      console.log(`Room name: ${room.name}`);
      console.log(`Local participant: ${room.localParticipant.identity}`);

      // Record when the connection was established
      if (connectionEstablishedAt.current === null) {
        connectionEstablishedAt.current = Date.now();
        console.log("Connection established timestamp set");
      }

      // Initial capacity check
      checkRoomCapacity();
    }

    // Set up event listeners for participants
    const onParticipantConnected = (participant: Participant) => {
      console.log(`Participant connected: ${participant.identity}`);
      // Reset the disconnect action flag when a new participant connects
      hasTriggeredDisconnectAction.current = false;
      checkRoomCapacity();
    };

    const onParticipantDisconnected = (participant: Participant) => {
      console.log(`Participant disconnected: ${participant.identity}`);

      // Clean up room tracking to prevent ghost users
      if (participant.identity !== username) {
        // This is the other participant who left
        onOtherParticipantDisconnected(participant.identity);

        // Clean up room tracking
        cleanupRoomTracking(participant.identity, room.name);
      }

      checkRoomCapacity();
    };

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    // Monitor connection state changes
    const handleConnectionStateChanged = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        checkRoomCapacity();
      } else if (state === ConnectionState.Disconnected) {
        // When we're disconnected, reset the flag
        hasTriggeredDisconnectAction.current = false;
      }
    };

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);

    // Clean up when the component unmounts
    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    };
  }, [
    connectionState,
    room,
    checkRoomCapacity,
    onOtherParticipantDisconnected,
    onParticipantCountChange,
    username,
  ]);

  // Clean up when the component unmounts
  useEffect(() => {
    const mountTime = Date.now(); // Track when this component was mounted

    return () => {
      const unmountTime = Date.now();
      const mountDuration = unmountTime - mountTime;

      // Only clean up if we've been mounted for a reasonable time
      // This prevents navigation-related flicker from causing disconnects
      if (mountDuration < 3000) {
        console.log(
          `Skipping cleanup in ConnectionStateLogger - component only mounted for ${mountDuration}ms`
        );
        return;
      }

      // Clean up room tracking when component unmounts
      if (username && room?.name) {
        // Don't clean up if we're still in the stabilization period
        if (!isStableConnection.current) {
          console.log(`Skipping cleanup - connection was not yet stable`);
          return;
        }

        // Check if we should skip disconnection (set by StableRoomConnector)
        const shouldSkipDisconnect =
          typeof window !== "undefined" &&
          window.sessionStorage.getItem("skipDisconnect") === "true";

        if (shouldSkipDisconnect) {
          console.log(
            `Skipping cleanup in ConnectionStateLogger due to skipDisconnect flag`
          );
          return;
        }

        console.log(
          `Cleaning up in ConnectionStateLogger after ${mountDuration}ms`
        );
        cleanupRoomTracking(username, room.name);
      }
    };
  }, [username, room?.name]);

  // Render room full message if applicable
  if (isRoomFull && connectionState === ConnectionState.Disconnected) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50">
        <div className="bg-[#1E1E1E] p-6 rounded-lg max-w-md text-center">
          <h2 className="text-xl font-bold text-red-500 mb-4">Room Full</h2>
          <p className="mb-4">
            This room already has the maximum of {maxParticipants} participants.
          </p>
          <p className="text-sm text-gray-400">
            Please try again later or join a different room.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
