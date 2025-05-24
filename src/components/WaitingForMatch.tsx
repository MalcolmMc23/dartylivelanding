"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface WaitingForMatchProps {
  username: string;
  onReturnToHome: () => void;
}

export function WaitingForMatch({ onReturnToHome }: WaitingForMatchProps) {
  const [waitTime, setWaitTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWaitTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-[#1E1E1E] p-8 rounded-lg max-w-md text-center border border-purple-500/20">
        <div className="mb-6">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Looking for a new match...
          </h2>
          <p className="text-gray-300 mb-2">
            Your partner left the call. We&apos;re finding you someone new to
            chat with!
          </p>
          <p className="text-purple-400 text-sm">
            Wait time: {formatTime(waitTime)}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            You&apos;ll be matched automatically, or you can return to the main
            page.
          </p>

          <Button
            onClick={onReturnToHome}
            variant="outline"
            className="w-full bg-transparent border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white"
          >
            Return to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
