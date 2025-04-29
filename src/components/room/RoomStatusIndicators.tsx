"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface RoomStatusIndicatorsProps {
  usingDemoServer: boolean;
  participantCount: number;
  maxParticipants: number;
}

export function RoomStatusIndicators({
  usingDemoServer,
  participantCount,
  maxParticipants,
}: RoomStatusIndicatorsProps) {
  const [showDemoIndicator, setShowDemoIndicator] = useState(true);

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
