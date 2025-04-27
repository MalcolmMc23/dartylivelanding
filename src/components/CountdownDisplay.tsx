"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CountdownTimer from "./CountdownTimer";
import { getNextWednesdayNoon } from "@/utils/dateUtils";

export default function CountdownDisplay() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "dartylive@uoregon.edu";
  const [targetDate, setTargetDate] = useState<Date | null>(null);

  useEffect(() => {
    setTargetDate(getNextWednesdayNoon());
  }, []);

  if (!targetDate) {
    return <div>Loading...</div>;
  }

  return (
    <>
      {/* Message */}
      <p className="text-lg text-gray-300">
        Thanks Dartylive! We&apos;re launching in:
      </p>

      {/* Countdown Timer */}
      <CountdownTimer targetDate={targetDate} />

      {/* Email notification message */}
      <p className="text-sm text-gray-400">
        We&apos;ll notify you at <span className="text-[#A0FF00]">{email}</span>{" "}
        when Dormparty goes live.
      </p>
    </>
  );
}
