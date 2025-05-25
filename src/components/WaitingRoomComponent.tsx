"use client";

import { useState, useEffect } from "react";
import { QueuePositionIndicator } from "./QueuePositionIndicator";

interface WaitingRoomComponentProps {
  username: string;
  onCancel: () => void;
}

export default function WaitingRoomComponent({
  username,
  onCancel,
}: WaitingRoomComponentProps) {
  const [waitTime, setWaitTime] = useState(0);
  const [dots, setDots] = useState("");

  // Update waiting time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setWaitTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Animate the dots for visual feedback
  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 500);
    return () => clearInterval(dotTimer);
  }, []);

  // Format the wait time as minutes:seconds
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="w-full max-w-md p-6 rounded-2xl shadow-2xl text-center bg-gradient-to-br from-[#232526]/80 to-[#1E1E1E]/90 backdrop-blur-md border border-[#A020F0]/20">
      <h2 className="text-3xl font-extrabold mb-8 tracking-tight text-white drop-shadow">
        Finding You a Match
        <span className="text-[#A020F0]">{dots}</span>
      </h2>

      <div className="mb-10">
        <div className="w-28 h-28 mx-auto mb-6 rounded-full bg-[#2A2A2A]/70 flex items-center justify-center shadow-lg">
          <div className="animate-spin rounded-full h-20 w-20 border-[6px] border-t-[#A020F0] border-b-[#A020F0]/40 border-l-transparent border-r-transparent"></div>
        </div>

        <p className="text-white mb-2 text-lg font-medium">
          Hi <span className="font-semibold text-[#A020F0]">{username}</span>!
        </p>
        <p className="text-gray-300 mb-2 text-base">
          Waiting for someone to chat with...
        </p>
        <p className="text-xs text-gray-400 tracking-wide">
          Wait time: {formatTime(waitTime)}
        </p>
      </div>

      {/* Queue Position Indicator */}
      <div className="mb-6">
        <QueuePositionIndicator username={username} />
      </div>

      <button
        onClick={onCancel}
        className="w-full bg-[#2A2A2A]/80 text-white p-3 rounded-xl font-semibold shadow-md hover:cursor-pointer hover:bg-[#A020F0] hover:text-white transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#A020F0]/60"
      >
        Cancel
      </button>
    </div>
  );
}
