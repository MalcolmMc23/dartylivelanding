"use client";

import { useState, useEffect } from "react";

interface WaitingRoomComponentProps {
  username: string;
  onCancel: () => void;
}

interface QueueStatus {
  queueCount: number;
  activeMatchCount: number;
}

export default function WaitingRoomComponent({
  username,
  onCancel,
}: WaitingRoomComponentProps) {
  const [waitTime, setWaitTime] = useState(0);
  const [dots, setDots] = useState("");
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    "Waiting for someone to chat with..."
  );

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

  // Check queue status periodically
  useEffect(() => {
    const checkQueueStatus = async () => {
      try {
        const response = await fetch(
          "/api/production-health?action=status&detailed=true"
        );
        const data = await response.json();

        setQueueStatus({
          queueCount: data.queueCount || 0,
          activeMatchCount: data.activeMatchCount || 0,
        });

        // Update status message based on queue
        if (data.queueCount <= 1) {
          setStatusMessage("Looking for other users...");
        } else if (data.queueCount === 2) {
          setStatusMessage("Found someone! Connecting...");
        } else {
          setStatusMessage(`${data.queueCount - 1} other users waiting`);
        }
      } catch (error) {
        console.error("Error checking queue status:", error);
      }
    };

    // Check immediately
    checkQueueStatus();

    // Then check every 3 seconds
    const statusTimer = setInterval(checkQueueStatus, 3000);

    return () => clearInterval(statusTimer);
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
        <p className="text-gray-300 mb-2 text-base">{statusMessage}</p>
        <p className="text-xs text-gray-400 tracking-wide mb-2">
          Wait time: {formatTime(waitTime)}
        </p>

        {queueStatus && (
          <div className="text-xs text-gray-500 space-y-1">
            <p>Queue: {queueStatus.queueCount} users</p>
            {queueStatus.activeMatchCount > 0 && (
              <p>Active chats: {queueStatus.activeMatchCount}</p>
            )}
          </div>
        )}
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
