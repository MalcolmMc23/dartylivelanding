"use client";

import StyledEmailInput from "@/components/StyledEmailInput";
import UniversityLogoScroll from "@/components/university/UniversityLogoScroll";
import AnimatedStars from "@/components/AnimatedStars";
import CountdownTimer from "@/app/countdown/components/CountdownTimer";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [showWarning, setShowWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const [targetDate, setTargetDate] = useState<Date | null>(null);

  useEffect(() => {
    // Set to June 13, 2025 at noon
    const target = new Date(2025, 5, 13); // Month is 0-indexed, so 5 = June
    target.setHours(12, 0, 0, 0); // Set to noon

    setTargetDate(target);
  }, []);

  const handleTryVideoChat = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email || !email.endsWith(".edu")) {
      setShowWarning(true);
      return;
    }

    try {
      setIsSubmitting(true);

      // Submit email to database
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        console.error("Failed to submit email");
        setShowWarning(true);
        return;
      }

      // Redirect to countdown page
      router.push(`/countdown?email=${encodeURIComponent(email)}`);
    } catch (err) {
      console.error(err);
      setShowWarning(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <AnimatedStars />
      <div className="relative flex flex-col items-center justify-between min-h-screen text-white p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
        <main className="flex flex-col items-center gap-6 md:gap-8 text-center w-full max-w-4xl mt-8">
          {/* Logo */}
          <h1 className="text-4xl md:text-5xl font-bold mt-8">
            DormParty<span className="text-[#A259FF]">.live</span>
          </h1>

          {/* Waitlist announcement */}
          <div className="mt-4 mb-2">
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              Join the waitlist!
            </h2>
            <p className="text-xl md:text-2xl mt-2 text-[#A259FF] font-semibold">
              Next batch in:
            </p>
          </div>

          {/* Countdown Timer */}
          {targetDate && <CountdownTimer targetDate={targetDate} />}

          {/* Subtitle */}
          <p className="text-lg text-gray-400">Sign in with .edu</p>

          {/* University Logos Infinite Scroll */}
          <div className="w-full">
            <UniversityLogoScroll />
          </div>

          {/* Email Input */}
          <div className="w-full max-w-md mt-2">
            <StyledEmailInput onEmailChange={setEmail} />
          </div>

          {/* Video Chat Link */}
          <div className="mt-6">
            <button
              onClick={handleTryVideoChat}
              className={`px-6 py-3 bg-[#A259FF] text-black font-semibold rounded-md hover:bg-opacity-90 transition-all ${
                isSubmitting ? "opacity-70" : ""
              }`}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <div className="w-4 h-4 mr-2 border-2 border-t-2 border-black border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </span>
              ) : (
                "Join Waitlist"
              )}
            </button>
            {showWarning && (
              <p className="mt-2 text-sm text-red-400">
                Please enter a valid .edu email to continue
              </p>
            )}
          </div>
        </main>

        {/* Contact Email - Non-overlapping Footer */}
        <div className="w-full text-center py-4 text-xs text-gray-500 mt-auto">
          <a
            href="mailto:dormroomsocial1@gmail.com"
            className="hover:text-[#A259FF] transition-colors inline-block px-2 py-1"
          >
            dormroomsocial1@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}
