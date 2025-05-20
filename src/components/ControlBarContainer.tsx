"use client";

import { ReactNode } from "react";

interface ControlBarContainerProps {
  controlButtons: ReactNode;
  className?: string; // Add this line
}

export function ControlBarContainer({
  controlButtons,
  className, // Add this line
}: ControlBarContainerProps) {
  return (
    <div className={`relative flex flex-col items-center w-full mt-15 ${className || ""}`}>
      <div className="flex gap-4 p-4 bg-[#16222a] rounded-full shadow-lg">
        {controlButtons}
      </div>
    </div>
  );
}
