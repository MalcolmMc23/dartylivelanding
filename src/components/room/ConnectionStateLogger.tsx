"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useConnectionState, useRoomContext } from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  Participant,
  RemoteParticipant,
} from "livekit-client";

interface ConnectionStateLoggerProps {
  onParticipantCountChange: (count: number) => void;
  maxParticipants: number;
  username: string;
  roomName: string;
  onOtherParticipantDisconnected: (otherUsername: string) => void;
}

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
  const [previousParticipantCount, setPreviousParticipantCount] = useState(0);
  const [otherParticipants, setOtherParticipants] = useState<string[]>([]);
  // Track if we've already triggered a participant disconnect action
  const hasTriggeredDisconnectAction = useRef(false);
  // Use Ref to track the connection establishment time
  const connectionEstablishedAt = useRef<number | null>(null);

  // Define a minimum stable connection time (5 seconds)
  const MIN_STABLE_CONNECTION_TIME = 5000;

  // Reset the disconnect action flag when the component mounts or roomName changes
  useEffect(() => {
    hasTriggeredDisconnectAction.current = false;
    connectionEstablishedAt.current = null;
    return () => {
      // Clean up when component unmounts
      hasTriggeredDisconnectAction.current = false;
    };
  }, [roomName]);

  // Function to check if room is at capacity
  const checkRoomCapacity = useCallback(() => {
    const participantCount = room.remoteParticipants.size + 1; // +1 for local participant
    console.log(
      `Room capacity check: ${participantCount}/${maxParticipants} participants`
    );

    const participantList = Array.from(room.remoteParticipants.values()).map(
      (p: RemoteParticipant) => p.identity
    );

    // Keep track of other participants
    setOtherParticipants(participantList);

    console.log("Current participants:", [
      room.localParticipant.identity,
      ...participantList,
    ]);

    onParticipantCountChange(participantCount);

    // For auto-matching, we need to detect when a participant leaves
    const hadOtherParticipant = previousParticipantCount === 2;
    const nowAlone = participantCount === 1;

    if (
      hadOtherParticipant &&
      nowAlone &&
      !hasTriggeredDisconnectAction.current
    ) {
      console.log(
        "Other participant has disconnected - will look for new match"
      );

      // Set the flag to prevent multiple triggers
      hasTriggeredDisconnectAction.current = true;

      // Add grace period before handling disconnection
      setTimeout(() => {
        // Call the function to handle the other participant disconnecting
        if (otherParticipants.length > 0) {
          onOtherParticipantDisconnected(otherParticipants[0]);
        }
      }, 2000); // 2-second grace period
    }

    setPreviousParticipantCount(participantCount);

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
    previousParticipantCount,
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
      const disconnectedParticipantIdentity = participant.identity;

      // Get current participant count *after* disconnection
      const currentRemoteCount = room.remoteParticipants.size;
      const currentTotalCount = currentRemoteCount + 1; // +1 for local participant

      console.log(`Participant count after disconnect: ${currentTotalCount}`);

      // If only the local participant remains, trigger the disconnect handler
      if (currentTotalCount === 1 && !hasTriggeredDisconnectAction.current) {
        console.log(
          "Only local participant remaining - triggering disconnect action"
        );

        // Check if we've had a stable connection for the minimum time
        const now = Date.now();
        const connectionTime = connectionEstablishedAt.current
          ? now - connectionEstablishedAt.current
          : 0;

        console.log(`Connection has been stable for ${connectionTime}ms`);

        // Only handle disconnection if we've had a stable connection
        // or if it's been long enough to consider it a real disconnect
        if (connectionTime >= MIN_STABLE_CONNECTION_TIME) {
          hasTriggeredDisconnectAction.current = true;

          // Add a grace period before initiating the disconnection action
          // This prevents premature disconnections during initial connection establishment
          setTimeout(() => {
            // Call the handler passed from the parent with the disconnected participant's identity
            onOtherParticipantDisconnected(disconnectedParticipantIdentity);

            // Force a re-render of parent components to ensure UI updates
            if (currentTotalCount !== previousParticipantCount) {
              onParticipantCountChange(currentTotalCount);
            }
          }, 2000); // 2-second grace period
        } else {
          console.log(
            `Ignoring disconnection during initial connection period (${connectionTime}ms)`
          );
        }
      }

      // Update capacity state (for UI indicators etc.)
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

    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    };
  }, [
    connectionState,
    room,
    roomName,
    onOtherParticipantDisconnected,
    onParticipantCountChange,
    previousParticipantCount,
  ]);

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
