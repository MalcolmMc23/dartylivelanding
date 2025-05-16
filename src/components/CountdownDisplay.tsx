"use client";

import { useEffect, useState } from "react";
import CountdownTimer from "./CountdownTimer";
import { getNextSundayNoon } from "@/utils/dateUtils";

export default function CountdownDisplay() {

  const [targetDate, setTargetDate] = useState<Date | null>(null);

  useEffect(() => {
    setTargetDate(getNextSundayNoon());
  }, []);

  if (!targetDate) {
    return <div>Loading...</div>;
  }

  return (
    <>
      {/* Message */}
      <p className="text-lg text-gray-300">
        Thanks DormParty.live! We&apos;re launching in:
      </p>

      {/* Countdown Timer */}
      <CountdownTimer targetDate={targetDate} />

      {/* Notification message */}
      <p className="text-sm text-gray-400">
        You&apos;re on the <span className="text-[#A0FF00]">exclusive waitlist</span>!{" "}
        We&apos;ll notify you as soon as we launch.
      </p>
    </>
  );
}
