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
}: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-12 h-12 rounded-full flex items-center justify-center transition-all",
        active ? activeColor : inactiveColor
      )}
      aria-label={ariaLabel}
    >
      {active ? activeIcon : inactiveIcon || activeIcon}
    </button>
  );
}
