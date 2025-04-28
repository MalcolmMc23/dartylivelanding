"use client";

import StyledEmailInput from "@/components/StyledEmailInput";
import UniversityLogoScroll from "@/components/UniversityLogoScroll";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [email, setEmail] = useState("");
  const [showWarning, setShowWarning] = useState(false);
  const router = useRouter();

  const handleTryVideoChat = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email || !email.endsWith(".edu")) {
      setShowWarning(true);
      return;
    }
    router.push(`/countdown?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col items-center gap-6 md:gap-8 text-center w-full max-w-4xl">
        {/* Logo */}
        <h1 className="text-4xl md:text-5xl font-bold mt-8">
          DormParty<span className="text-[#A0FF00]">.live</span>
        </h1>

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
            className="px-6 py-3 bg-[#A0FF00] text-black font-semibold rounded-md hover:bg-opacity-90 transition-all"
          >
            Try Video Chat
          </button>
          {showWarning && (
            <p className="mt-2 text-sm text-red-400">
              Please enter a valid .edu email to continue
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
