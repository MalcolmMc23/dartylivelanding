"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { LoginDialog } from "@/components/auth/LoginDialog";
import Typewriter from "./Typewriter";
import { RoomMatchingActions } from "../hooks/useRoomMatching";

type MatchingInterfaceProps = {
  error: string;
  actions: RoomMatchingActions;
};

export default function MatchingInterface({
  error,
  actions,
}: MatchingInterfaceProps) {
  const { data: session } = useSession();
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const { findRandomChat, findRandomChatRef } = actions;

  const handleFindChatClick = () => {
    if (!session) {
      setShowLoginDialog(true);
    } else {
      findRandomChat();
    }
  };

  return (
    <div className="relative z-10 w-full max-w-md p-8 bg-[#1A1A1A] rounded-2xl shadow-2xl backdrop-blur-sm border border-[#2A2A2A]">
      {/* --- Animated Typewriter with color split for DormParty.live --- */}
      <Typewriter className="mb-14 text-center" />
      {/* --- End Typewriter --- */}

      {error && (
        <div className="mb-4 flex items-center gap-3 p-4 rounded-lg bg-[#1a1a1a] border border-[#ff3b3b] shadow-sm">
          <svg
            className="w-5 h-5 text-[#ff3b3b] flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-base font-bold text-white">{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <button
          onClick={handleFindChatClick}
          className="w-full bg-[#A855F7] text-white px-3.5 py-4 rounded-xl font-semibold hover:cursor-pointer hover:bg-[#9333EA] transition-all duration-200 shadow-lg shadow-[#A855F7]/20"
        >
          Find Random Chat
        </button>
      </div>

      <LoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        onSuccess={() => {
          setShowLoginDialog(false);
          // Call findRandomChat after successful login
          findRandomChatRef.current();
        }}
      />
    </div>
  );
}
