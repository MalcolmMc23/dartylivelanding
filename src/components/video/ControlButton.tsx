"use client";

export interface ControlButtonProps {
  onClick: () => void;
  disabled: boolean;
  active: boolean;
  activeColor?: string;
  inactiveColor?: string;
  ariaLabel: string;
  activeIcon: React.ReactNode;
  inactiveIcon?: React.ReactNode;
  variant?: "default" | "chat";
}

export function ControlButton({
  onClick,
  disabled,
  active,
  activeColor,
  inactiveColor,
  ariaLabel,
  activeIcon,
  inactiveIcon,
}: ControlButtonProps) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`
          flex items-center justify-center
          shadow-md
          transition-all
          ${active ? activeColor : inactiveColor}
          hover:scale-105
          disabled:opacity-50
          disabled:cursor-not-allowed
          text-xl
          w-24 h-14 md:w-28 md:h-16
          cursor-pointer
          rounded-lg
        `}
      >
        {active ? activeIcon : inactiveIcon}
      </button>
      {/* Tooltip */}
      <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg bg-[#2a1857] text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-20 whitespace-nowrap">
        {ariaLabel === "Leave call"
          ? "Skip"
          : ariaLabel === "End call"
          ? "End Call"
          : ariaLabel === "Report user"
          ? "Report User"
          : ariaLabel.includes("camera")
          ? "Toggle Camera"
          : ariaLabel.includes("chat")
          ? "Toggle Chat"
          : "Toggle Microphone"}
      </span>
    </div>
  );
}
