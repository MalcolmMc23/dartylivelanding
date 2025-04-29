"use client";

import { ReactNode } from "react";

interface ControlBarContainerProps {
  findNewMatchButton: ReactNode;
  controlButtons: ReactNode;
}

export function ControlBarContainer({
  findNewMatchButton,
  controlButtons,
}: ControlBarContainerProps) {
  return (
    <div className="relative flex flex-col items-center">
      <div className="mb-4">{findNewMatchButton}</div>
      <div className="flex gap-4 p-4 bg-[#1A1A1A] rounded-full shadow-lg">
        {controlButtons}
      </div>
    </div>
  );
}
