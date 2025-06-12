"use client";

import { ControlButton } from "../video/ControlButton";

interface CallActionButtonsProps {
  onSkip: () => void;
  onEnd: () => void;
  isRedirecting: boolean;
}

export function CallActionButtons({
  onSkip,
  onEnd,
  isRedirecting,
}: CallActionButtonsProps) {
  return (
    <>
      {/* Skip Button */}
      <ControlButton
        onClick={onSkip}
        disabled={isRedirecting}
        active={false}
        activeColor="bg-gradient-to-br from-green-600 via-green-500 to-green-700 shadow-lg hover:scale-110"
        inactiveColor="bg-gradient-to-br from-green-600 via-green-500 to-green-700 shadow-lg hover:scale-110"
        ariaLabel="Leave call"
        activeIcon={
          <span
            className="font-extrabold text-xl md:text-2xl tracking-widest text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            style={{ letterSpacing: "0.15em", fontFamily: "Inter, sans-serif" }}
          >
            SKIP
          </span>
        }
        inactiveIcon={
          <span
            className="font-extrabold text-xl md:text-2xl tracking-widest text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            style={{ letterSpacing: "0.15em", fontFamily: "Inter, sans-serif" }}
          >
            SKIP
          </span>
        }
      />

      {/* End Call Button */}
      <ControlButton
        onClick={onEnd}
        disabled={isRedirecting}
        active={false}
        activeColor="bg-gradient-to-br from-red-800 via-red-700 to-red-900 shadow-lg hover:scale-110"
        inactiveColor="bg-gradient-to-br from-red-800 via-red-700 to-red-900 shadow-lg hover:scale-110"
        ariaLabel="End call"
        activeIcon={
          <span
            className="font-extrabold text-xl md:text-2xl tracking-widest text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            style={{ letterSpacing: "0.15em", fontFamily: "Inter, sans-serif" }}
          >
            END
          </span>
        }
        inactiveIcon={
          <span
            className="font-extrabold text-xl md:text-2xl tracking-widest text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            style={{ letterSpacing: "0.15em", fontFamily: "Inter, sans-serif" }}
          >
            END
          </span>
        }
      />
    </>
  );
}
