import { Suspense } from "react";
import CountdownDisplay from "@/components/CountdownDisplay";

export default function CountdownPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col items-center gap-6 md:gap-8 text-center w-full max-w-4xl">
        {/* Logo */}
        <h1 className="text-4xl md:text-5xl font-bold mt-8">
          DormParty<span className="text-[#A0FF00]">.live</span>
        </h1>

        <Suspense fallback={<p>Loading...</p>}>
          <CountdownDisplay />
        </Suspense>
      </main>
      
      {/* Contact Email - Minimal */}
      <div className="absolute bottom-2 text-xs text-gray-500">
        <a href="mailto:dormroomsocial1@gmail.com" className="hover:text-[#A0FF00] transition-colors">
          dormroomsocial1@gmail.com
        </a>
      </div>
    </div>
  );
}
