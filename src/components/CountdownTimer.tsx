"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  targetDate: Date;
}

export default function CountdownTimer({ targetDate }: CountdownTimerProps) {
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const difference = targetDate.getTime() - now.getTime();

      if (difference <= 0) {
        // Target date reached
        setDays(0);
        setHours(0);
        setMinutes(0);
        setSeconds(0);
        return;
      }

      const d = Math.floor(difference / (1000 * 60 * 60 * 24));
      const h = Math.floor(
        (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const m = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((difference % (1000 * 60)) / 1000);

      setDays(d);
      setHours(h);
      setMinutes(m);
      setSeconds(s);
    };

    // Update countdown immediately
    updateCountdown();

    // Then update every second
    const interval = setInterval(updateCountdown, 1000);

    // Clean up interval
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="flex items-center justify-center gap-4 md:gap-8 my-6">
      <div className="flex flex-col items-center">
        <span className="text-4xl md:text-6xl font-bold">
          {String(days).padStart(2, "0")}
        </span>
        <span className="text-xs md:text-sm text-gray-400">Days</span>
      </div>
      <span className="text-2xl md:text-4xl font-bold text-gray-600">·</span>
      <div className="flex flex-col items-center">
        <span className="text-4xl md:text-6xl font-bold">
          {String(hours).padStart(2, "0")}
        </span>
        <span className="text-xs md:text-sm text-gray-400">Hours</span>
      </div>
      <span className="text-2xl md:text-4xl font-bold text-gray-600">·</span>
      <div className="flex flex-col items-center">
        <span className="text-4xl md:text-6xl font-bold">
          {String(minutes).padStart(2, "0")}
        </span>
        <span className="text-xs md:text-sm text-gray-400">Minutes</span>
      </div>
      <span className="text-2xl md:text-4xl font-bold text-gray-600">·</span>
      <div className="flex flex-col items-center">
        <span className="text-4xl md:text-6xl font-bold">
          {String(seconds).padStart(2, "0")}
        </span>
        <span className="text-xs md:text-sm text-gray-400">Seconds</span>
      </div>
    </div>
  );
}
