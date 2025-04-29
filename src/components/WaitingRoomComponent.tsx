"use client";

import { useState, useEffect } from "react";

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
  const [attempts, setAttempts] = useState(0);

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

  // Periodically call the retry-matches endpoint to actively match users
  useEffect(() => {
    // Trigger match retry every 3 seconds after waiting for 2 seconds initially
    // This helps ensure our retry-matches API is called regularly while users wait
    const retryMatchInterval = setInterval(async () => {
      try {
        console.log(
          `Proactively trying to find matches for waiting users (attempt ${
            attempts + 1
          })...`
        );
        const response = await fetch("/api/retry-matches");
        const data = await response.json();

        if (data.matchesMade && data.matchesMade.length > 0) {
          console.log(`Retry-matches found ${data.matchesMade.length} matches`);
        }

        setAttempts((prev) => prev + 1);
      } catch (error) {
        console.error("Error calling retry-matches:", error);
      }
    }, 3000);

    // Make first call after 2 seconds to give the initial matching a chance
    const initialTimeout = setTimeout(() => {
      setAttempts(1);
    }, 2000);

    return () => {
      clearInterval(retryMatchInterval);
      clearTimeout(initialTimeout);
    };
  }, [attempts]);

  // Format the wait time as minutes:seconds
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="w-full max-w-md p-6 bg-[#1E1E1E] rounded-lg shadow-md text-center">
      <h2 className="text-2xl font-bold mb-6">
        Finding You a Match<span className="text-[#A0FF00]">{dots}</span>
      </h2>

      <div className="mb-8">
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-[#2A2A2A] flex items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#A0FF00]"></div>
        </div>

        <p className="text-white mb-2">
          Hi <span className="font-medium">{username}</span>!
        </p>
        <p className="text-gray-300 mb-2">
          Waiting for someone to chat with...
        </p>
        <p className="text-sm text-gray-500">
          Wait time: {formatTime(waitTime)}
        </p>
        {waitTime > 10 && (
          <p className="text-xs text-gray-400 mt-2">
            Taking longer than usual. We&apos;re trying to find you a good
            match...
          </p>
        )}
      </div>

      <button
        onClick={onCancel}
        className="w-full bg-[#2A2A2A] text-white p-2 rounded font-semibold hover:bg-[#3A3A3A]"
      >
        Cancel
      </button>
    </div>
  );
}
