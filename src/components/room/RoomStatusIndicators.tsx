"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useParticipants } from "@livekit/components-react";

interface RoomStatusIndicatorsProps {
  usingDemoServer: boolean;
  participantCount: number;
  maxParticipants: number;
  onParticipantLeft?: (otherUsername: string) => void;
}

export function RoomStatusIndicators({
  usingDemoServer,
  participantCount,
  maxParticipants,
  onParticipantLeft,
}: RoomStatusIndicatorsProps) {
  const [showDemoIndicator, setShowDemoIndicator] = useState(true);
  const participants = useParticipants();

  // Track participants and detect when someone leaves
  useEffect(() => {
    if (!onParticipantLeft) return;

    const participantIds = new Set(participants.map((p) => p.identity));
    const handleParticipantChange = () => {
      const currentParticipantIds = new Set(
        participants.map((p) => p.identity)
      );

      // Check if any participant has left
      participantIds.forEach((id) => {
        if (!currentParticipantIds.has(id)) {
          console.log(`Participant ${id} has left the room`);
          onParticipantLeft(id);
        }
      });

      // Update our tracking set
      participantIds.clear();
      currentParticipantIds.forEach((id) => participantIds.add(id));
    };

    // Initialize our tracking set
    participants.forEach((p) => participantIds.add(p.identity));

    // Create an observer to watch for participant changes
    const observer = new MutationObserver(handleParticipantChange);

    // Observe any DOM changes that might indicate participant changes
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
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

      {/* Waiting for match indicator */}
      {participantCount === 1 && (
        <div className="mt-3 bg-blue-600 text-white text-xs md:text-sm px-3 py-1 rounded-full animate-pulse">
          Waiting for someone to join...
        </div>
      )}
    </div>
  );
}
