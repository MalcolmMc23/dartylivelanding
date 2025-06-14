"use client";

import { useEffect, useState } from "react";
import CountdownTimer from "./CountdownTimer";

export default function CountdownDisplay() {
  const [targetDate, setTargetDate] = useState<Date | null>(null);

  useEffect(() => {
    // Set to this Wednesday at noon
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    let daysUntilWednesday = (3 - dayOfWeek + 7) % 7;
    if (daysUntilWednesday === 0 && now.getHours() >= 12) {
      daysUntilWednesday = 7; // If it's already Wednesday past noon, go to next week
    }
    const target = new Date(now);
    target.setDate(now.getDate() + daysUntilWednesday);
    target.setHours(12, 0, 0, 0); // Set to noon

    setTargetDate(target);
  }, []);

  if (!targetDate) {
    return <div>Loading...</div>;
  }

  return (
    <>
      {/* Message */}
      <div className="mt-4 mb-2">
        <h2 className="text-2xl md:text-3xl font-bold text-white">
          You&apos;re on the waitlist!
        </h2>
        <p className="text-xl md:text-2xl mt-2 text-[#A259FF] font-semibold">
          Next batch in:
        </p>
      </div>

      {/* Countdown Timer */}
      <CountdownTimer targetDate={targetDate} />

      {/* Notification message */}
      <p className="text-sm text-gray-400 mt-4">
        You&apos;re on the{" "}
        <span className="text-[#A259FF]">exclusive waitlist</span>! We&apos;ll
        notify you as soon as we launch.
      </p>
    </>
  );
}
