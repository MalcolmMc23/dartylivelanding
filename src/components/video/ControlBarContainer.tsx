"use client";

import { ReactNode } from "react";

interface ControlBarContainerProps {
  controlButtons: ReactNode;
}

export function ControlBarContainer({
  controlButtons,
}: ControlBarContainerProps) {
  return (
    <div className="relative flex flex-col items-center w-full mt-15">
      <div className="flex gap-4 p-4 rounded-full shadow-lg">
        {controlButtons}
      </div>
    </div>
  );
}
