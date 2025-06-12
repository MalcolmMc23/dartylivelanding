"use client";

import { useState, useEffect } from "react";

// Move lines array outside the component to avoid re-creation on every render
const TYPEWRITER_LINES = ["Welcome to", "DormParty.live"];

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
  const [displayed, setDisplayed] = useState(["", ""]); // Initialize with two empty strings for two lines
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);

  useEffect(() => {
    if (lineIdx < lines.length) {
      if (charIdx < lines[lineIdx].length) {
        const timeout = setTimeout(() => {
          setDisplayed((prev) => {
            const newLines = [...prev];
            newLines[lineIdx] = (newLines[lineIdx] || "") + lines[lineIdx][charIdx];
            return newLines;
          });
          setCharIdx((c) => c + 1);
        }, delay);
        return () => clearTimeout(timeout);
      } else if (lineIdx + 1 < lines.length) {
        // Only proceed to next line if there is one
        const timeout = setTimeout(() => {
          setLineIdx((l) => l + 1);
          setCharIdx(0);
        }, lineDelay);
        return () => clearTimeout(timeout);
      }
    }
  }, [charIdx, lineIdx, lines, delay, lineDelay]);

  return (
    <div className={`font-[family-name:var(--font-geist-sans)] ${className}`}>
      <div className="text-2xl md:text-3xl font-medium mb-1">
        {displayed[0]}
        {lineIdx === 0 && <span className="animate-pulse">|</span>}
      </div>
      <div className="text-4xl md:text-5xl font-extrabold tracking-tight relative">
        <span className="text-[#A855F7]">
          {lineIdx === 1 && charIdx === lines[1].length ? (
            // Render individual characters for hover effect once fully typed
            lines[1].split('').map((char, index) => (
              <span
                key={index}
                className="inline-block transition-all duration-200 hover:-translate-y-2 hover:scale-110 cursor-pointer"
                style={{ transitionDelay: `${index * 20}ms` }}
              >
                {char === ' ' ? '\u00A0' : char} {/* Use non-breaking space for actual spaces */}
              </span>
            ))
          ) : (
            // Normal typing display
            displayed[1]
          )}
          {lineIdx === 1 && charIdx < lines[1].length && <span className="animate-pulse">|</span>}
          {lineIdx === 1 && charIdx === lines[1].length && <span className="ml-1 inline-block animate-pulse">|</span>}
        </span>
      </div>
    </div>
  );
} 