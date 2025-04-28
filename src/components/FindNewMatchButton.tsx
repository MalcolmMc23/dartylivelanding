"use client";

import { cn } from "@/lib/utils";

export interface FindNewMatchButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export function FindNewMatchButton({
  onClick,
  disabled,
}: FindNewMatchButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-6 py-2 rounded-full bg-[#A0FF00] text-black font-medium hover:bg-opacity-90 transition-all shadow-md",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {disabled ? "Finding..." : "Find New Match"}
    </button>
  );
}
