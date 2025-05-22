"use client";

import { useState, useEffect } from "react";
import WaitingRoomComponent from "@/components/WaitingRoomComponent";
import AnimatedStars from "@/components/AnimatedStars";
import MatchingInterface from "./MatchingInterface";
import { useRoomMatching } from "../hooks/useRoomMatching";
import { useWaitingStatus } from "../hooks/useWaitingStatus";

export default function VideoChatHome() {
  const [state, actions] = useRoomMatching();
  const { username, isWaiting, error } = state;

  // Set up state handlers for the waiting status hook
  const [localIsWaiting, setLocalIsWaiting] = useState(isWaiting);

  // Sync the local state with the main state
  useEffect(() => {
    setLocalIsWaiting(isWaiting);
  }, [isWaiting]);

  // Use the waiting status hook for polling
  useWaitingStatus({
    isWaiting: localIsWaiting,
    username,
    setIsWaiting: (value) => {
      setLocalIsWaiting(value);
      // Sync back to the main state if changed by the polling
      if (value !== isWaiting) {
        if (!value) {
          actions.setError("");
        }
      }
    },
    setError: actions.setError,
    setUsingDemoServer: () => {
      // This is handled in the main hook
    },
  });

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
      {/* Animated stars background */}
      <AnimatedStars />

      {/* Main content above stars */}
      {isWaiting ? (
        <WaitingRoomComponent
          username={username}
          onCancel={actions.cancelWaiting}
        />
      ) : (
        <MatchingInterface error={error} actions={actions} />
      )}
    </div>
  );
}
