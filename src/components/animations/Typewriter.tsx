"use client";

import { useState, useEffect } from "react";

// Move lines array outside the component to avoid re-creation on every render
const TYPEWRITER_LINES = ["Welcome to", "DormParty", ".live"];

export default function Typewriter({
  delay = 40,
  lineDelay = 600,
  className = "",
}: {
  delay?: number;
  lineDelay?: number;
  className?: string;
}) {
  // Use the static lines array
  const lines = TYPEWRITER_LINES;
  const [displayed, setDisplayed] = useState([""]);
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);

  useEffect(() => {
    if (lineIdx < lines.length) {
      if (charIdx < lines[lineIdx].length) {
        const timeout = setTimeout(() => {
          setDisplayed((prev) => {
            const newLines = [...prev];
            newLines[lineIdx] =
              (newLines[lineIdx] || "") + lines[lineIdx][charIdx];
            return newLines;
          });
          setCharIdx((c) => c + 1);
        }, delay);
        return () => clearTimeout(timeout);
      } else if (lineIdx + 1 < lines.length) {
        const timeout = setTimeout(() => {
          setDisplayed((prev) => [...prev, ""]);
          setLineIdx((l) => l + 1);
          setCharIdx(0);
        }, lineDelay);
        return () => clearTimeout(timeout);
      }
    }
  }, [charIdx, lineIdx, lines, delay, lineDelay]);

  return (
    <div className={className}>
      <div className="text-lg md:text-xl font-medium mb-1">
        {displayed[0]}
        {lineIdx === 0 && <span className="animate-pulse">|</span>}
      </div>
      <div className="text-2xl md:text-3xl font-bold tracking-tight">
        <span className="text-white">
          {displayed[1]}
          {lineIdx === 1 && <span className="animate-pulse">|</span>}
        </span>
        <span className="text-[#A855F7]">
          {lineIdx > 1 ? displayed[2] : ""}
          {lineIdx === 2 && <span className="animate-pulse">|</span>}
        </span>
      </div>
    </div>
  );
} 