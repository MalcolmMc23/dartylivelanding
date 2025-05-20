"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useParticipants } from "@livekit/components-react";

interface RoomStatusIndicatorsProps {
  usingDemoServer: boolean;
  participantCount: number;
  maxParticipants: number;
  onParticipantLeft?: (otherUsername: string) => void;
  // otherParticipantLeft?: boolean; // Remove this line
}

export function RoomStatusIndicators({
  usingDemoServer,
  participantCount,
  maxParticipants,
  onParticipantLeft,
  // otherParticipantLeft = false, // Remove this line
}: RoomStatusIndicatorsProps) {
  const [showDemoIndicator, setShowDemoIndicator] = useState(true);
  const participants = useParticipants();
  const previousParticipantsRef = useRef<typeof participants>([]);

  // Track participants and detect when someone leaves
  useEffect(() => {
    if (!onParticipantLeft) return;

    const currentParticipantIdentities = new Set(
      participants.map((p) => p.identity)
    );
    const previousParticipantIdentities = new Set(
      previousParticipantsRef.current.map((p) => p.identity)
    );

    previousParticipantIdentities.forEach((prevId) => {
      if (!currentParticipantIdentities.has(prevId)) {
        // Check if the participants array actually reduced in size.
        // This helps prevent false positives during initial connection
        // or if the local user is the one disconnecting (useParticipants usually gives remote).
        if (participants.length < previousParticipantsRef.current.length) {
          console.log(
            `Participant ${prevId} has left the room (detected by hook change)`
          );
          onParticipantLeft(prevId);
        }
      }
    });

    // Update previous participants for the next render comparison
    previousParticipantsRef.current = participants;
  }, [participants, onParticipantLeft]);

  // Hide the demo indicator after a few seconds
  useEffect(() => {
    if (usingDemoServer) {
      const timer = setTimeout(() => {
        setShowDemoIndicator(false);
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [usingDemoServer]);

  const isRoomFull = participantCount >= maxParticipants;

  return (
    <div className="absolute top-0 left-0 right-0 z-10 p-3 flex flex-col items-center">
      <div className="w-full flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full animate-pulse",
              isRoomFull ? "bg-[#A0FF00]" : "bg-yellow-500"
            )}
          />
          <span className="text-xs font-medium text-white">
            {isRoomFull ? "Connected" : "Waiting..."}
          </span>

          {usingDemoServer && showDemoIndicator && (
            <div className="ml-2 px-2 py-0.5 bg-yellow-600 text-white text-xs rounded-md flex items-center">
              <span className="font-medium">Demo Mode</span>
            </div>
          )}
        </div>

        <div className="px-3 py-1 bg-[#1E1E1E] bg-opacity-75 backdrop-blur-sm text-white text-xs rounded-full flex items-center shadow-md">
          <span className="font-medium mr-1">Participants:</span>
          <span
            className={cn(
              "font-bold",
              isRoomFull ? "text-[#A0FF00]" : "text-white"
            )}
          >
            {participantCount}/{maxParticipants}
          </span>
        </div>
      </div>
    </div>
  );
}
