"use client";
import { Suspense } from "react";
import CountdownDisplay from "@/app/countdown/components/CountdownDisplay";
import AnimatedStars from "@/components/AnimatedStars";

export default function CountdownPage() {
  return (
    <div className="relative min-h-screen">
      <AnimatedStars />
      <div className="relative flex flex-col items-center justify-between min-h-screen text-white p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
        <main className="flex flex-col items-center gap-6 md:gap-8 text-center w-full max-w-4xl mt-8">
          {/* Logo */}
          <h1 className="text-4xl md:text-5xl font-bold mt-8">
            DormParty<span className="text-[#A259FF]">.live</span>
          </h1>

          <Suspense fallback={<p>Loading...</p>}>
            <CountdownDisplay />
          </Suspense>
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
