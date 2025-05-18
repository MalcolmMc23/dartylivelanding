"use client";

import { useEffect, useCallback } from "react";
import { useParticipants, useRoomContext } from "@livekit/components-react";
import { Participant } from "livekit-client";

interface ParticipantCounterProps {
  onCountChange: (count: number) => void;
}

export function ParticipantCounter({ onCountChange }: ParticipantCounterProps) {
  const participants = useParticipants();
  const room = useRoomContext();

  // More detailed debugging of participant state
  const logDetailedParticipants = useCallback(() => {
    if (!room) return;

    console.log("===== PARTICIPANT COUNT DIAGNOSTIC =====");
    console.log(`Room name: ${room.name}`);
    console.log(`Local participant: ${room.localParticipant.identity}`);
    console.log(`Remote participants: ${room.remoteParticipants.size}`);

    // Log details of all remote participants
    if (room.remoteParticipants.size > 0) {
      console.log("Remote participant details:");
      room.remoteParticipants.forEach((p: Participant) => {
        console.log(
          `- Identity: ${p.identity}, Metadata: ${p.metadata || "none"}`
        );
      });
    } else {
      console.log("No remote participants");
    }

    // Calculate true count (local + remote)
    const trueCount = 1 + room.remoteParticipants.size;
    console.log(`True participant count: ${trueCount}`);
    console.log("======================================");

    return trueCount;
  }, [room]);

  useEffect(() => {
    // Get the true participant count with detailed logging
    const trueCount = logDetailedParticipants();

    // Only update if we got a valid count
    if (trueCount) {
      onCountChange(trueCount);
    }
  }, [participants, onCountChange, logDetailedParticipants]);

  // Add a periodic check to catch any discrepancies
  useEffect(() => {
    const interval = setInterval(() => {
      const trueCount = logDetailedParticipants();
      if (trueCount) {
        onCountChange(trueCount);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [onCountChange, logDetailedParticipants]);

  return null;
}
