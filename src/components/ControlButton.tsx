"use client";

import { cn } from "@/lib/utils";

export interface ControlButtonProps {
  onClick: () => void;
  disabled: boolean;
  active: boolean;
  activeColor?: string;
  inactiveColor?: string;
  ariaLabel: string;
  activeIcon: React.ReactNode;
  inactiveIcon?: React.ReactNode;
  className?: string;
}

export function ControlButton({
  onClick,
  disabled,
  active,
  activeColor = "bg-gray-700 hover:bg-gray-600",
  inactiveColor = "bg-red-600 hover:bg-red-500",
  ariaLabel,
  activeIcon,
  inactiveIcon,
  className = "",
}: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`
        flex items-center justify-center
        rounded-full
        shadow-md
        transition-all
        ${active
          ? "bg-gradient-to-br from-[#a259ff] to-[#6a1b9a] text-white"
          : "bg-[#22153a]/80 text-[#a259ff] border border-[#3a1857]"}
        ${ariaLabel === "Leave call" ? "bg-gradient-to-br from-red-600 via-red-500 to-red-700 shadow-lg hover:scale-110" : ""}
        hover:scale-105
        disabled:opacity-50
        disabled:cursor-not-allowed
        text-xl
        w-12 h-12
        ${className}
      `}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  );
}
