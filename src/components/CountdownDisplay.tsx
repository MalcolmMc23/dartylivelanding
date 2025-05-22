"use client";

import { useEffect, useState } from "react";
import CountdownTimer from "./CountdownTimer";

export default function CountdownDisplay() {
  const [targetDate, setTargetDate] = useState<Date | null>(null);

  useEffect(() => {
    // Get next Monday at noon
    const now = new Date();
    const targetDay = 1; // Monday (0 = Sunday, 1 = Monday, etc.)
    const daysUntilMonday = (targetDay + 7 - now.getDay()) % 7;

    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(12, 0, 0, 0); // Set to noon

    setTargetDate(nextMonday);
  }, []);

  if (!targetDate) {
    return <div>Loading...</div>;
  }

  return (
    <>
      {/* Message */}
      <div className="mt-4 mb-2">
        <h2 className="text-2xl md:text-3xl font-bold text-white">
          The first batch of the waitlist has gone out!
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
