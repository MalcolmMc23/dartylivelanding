"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRoomContext, useParticipants } from "@livekit/components-react";
import { RoomEvent, Participant } from "livekit-client";

interface LiveKitSyncManagerProps {
  username: string;
  roomName: string;
}

export function LiveKitSyncManager({ roomName }: LiveKitSyncManagerProps) {
  const room = useRoomContext();
  const participants = useParticipants();
  const lastParticipantCount = useRef(0);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Function to trigger room sync
  const triggerRoomSync = useCallback(
    async (reason: string) => {
      try {
        console.log(`Triggering room sync for ${roomName}: ${reason}`);

        const response = await fetch("/api/sync-rooms", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "sync-room",
            roomName,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`Room sync result for ${roomName}:`, result);
        } else {
          console.error(
            `Room sync failed for ${roomName}:`,
            response.statusText
          );
        }
      } catch (error) {
        console.error(`Error triggering room sync for ${roomName}:`, error);
      }
    },
    [roomName]
  );

  // Debounced sync function to avoid too many rapid calls
  const debouncedSync = useCallback(
    (reason: string, delay: number = 2000) => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = setTimeout(() => {
        triggerRoomSync(reason);
      }, delay);
    },
    [triggerRoomSync]
  );

  // Monitor participant changes
  useEffect(() => {
    const currentCount = participants.length;

    if (lastParticipantCount.current !== currentCount) {
      console.log(
        `Participant count changed in room ${roomName}: ${lastParticipantCount.current} -> ${currentCount}`
      );

      // Trigger sync when participant count changes
      debouncedSync(`participant count changed to ${currentCount}`);

      lastParticipantCount.current = currentCount;
    }
  }, [participants.length, roomName, debouncedSync]);

  // Set up LiveKit event listeners
  useEffect(() => {
    if (!room) return;

    const handleParticipantConnected = (participant: Participant) => {
      console.log(
        `Participant connected to room ${roomName}: ${participant.identity}`
      );

      // Immediate sync for connections (shorter delay)
      debouncedSync(`participant ${participant.identity} connected`, 1000);
    };

    const handleParticipantDisconnected = (participant: Participant) => {
      console.log(
        `Participant disconnected from room ${roomName}: ${participant.identity}`
      );

      // Longer delay for disconnections to allow for reconnections
      debouncedSync(`participant ${participant.identity} disconnected`, 3000);
    };

    // Add event listeners
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);

    // Initial sync when component mounts
    debouncedSync("component mounted", 1000);

    // Cleanup
    return () => {
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(
        RoomEvent.ParticipantDisconnected,
        handleParticipantDisconnected
      );

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [room, roomName, debouncedSync]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  // This component doesn't render anything visible
  return null;
}
