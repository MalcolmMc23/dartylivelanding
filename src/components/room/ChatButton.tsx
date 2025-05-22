"use client";

import { LucideMessageSquareMore } from "lucide-react";
import { ControlButton } from "../ControlButton";

interface ChatButtonProps {
  onChatClick: () => void;
  hasUnreadChat?: boolean;
  isRedirecting: boolean;
}

export function ChatButton({
  onChatClick,
  hasUnreadChat = false,
  isRedirecting,
}: ChatButtonProps) {
  return (
    <div className="block lg:hidden relative">
      <ControlButton
        onClick={onChatClick}
        disabled={isRedirecting}
        active={false}
        variant="chat"
        ariaLabel="Toggle chat"
        activeIcon={
          <LucideMessageSquareMore
            color="white"
            size={24}
            className="text-white"
          />
        }
        inactiveIcon={
          <LucideMessageSquareMore
            color="white"
            size={24}
            className="text-white"
          />
        }
      />
      {hasUnreadChat && (
        <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse z-10" />
      )}
    </div>
  );
}
