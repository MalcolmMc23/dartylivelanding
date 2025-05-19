"use client";

interface WaitingOverlayProps {
  otherParticipantLeft: boolean;
}

export function WaitingOverlay({ otherParticipantLeft }: WaitingOverlayProps) {
  return (
    <div className="absolute inset-0 md:w-3/5 flex items-center justify-center pointer-events-none z-30">
      <div
        className="backdrop-blur-lg bg-gradient-to-br from-[#2d0036cc] via-[#3a0066cc] to-[#1a0026cc] border border-[#7c3aed] shadow-2xl p-8 rounded-2xl max-w-lg w-full mx-4 text-center"
        style={{
          boxShadow:
            "0 8px 32px 0 rgba(124,58,237,0.25), 0 1.5px 8px 0 rgba(0,0,0,0.25)",
          border: "1.5px solid #7c3aed55",
        }}
      >
        <h2 className="text-2xl md:text-3xl font-extrabold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-[#a78bfa] via-[#c084fc] to-[#7c3aed] drop-shadow-[0_2px_8px_rgba(124,58,237,0.25)]">
          {otherParticipantLeft
            ? "Finding you a new match..."
            : "Looking for a match..."}
        </h2>
        <p className="mb-6 text-[#e0e0ff] text-base md:text-lg font-medium">
          {otherParticipantLeft
            ? "The other user left. You'll be automatically matched with someone new."
            : "You are in the matching queue. Someone will join you soon."}
        </p>
        <div className="flex justify-center gap-2 mt-2">
          <div className="h-3 w-3 rounded-full bg-[#a78bfa] animate-pulse shadow-[0_0_8px_2px_#a78bfa99]" />
          <div
            className="h-3 w-3 rounded-full bg-[#c084fc] animate-pulse shadow-[0_0_8px_2px_#c084fc99]"
            style={{ animationDelay: "0.18s" }}
          />
          <div
            className="h-3 w-3 rounded-full bg-[#7c3aed] animate-pulse shadow-[0_0_8px_2px_#7c3aed99]"
            style={{ animationDelay: "0.36s" }}
          />
        </div>
      </div>
    </div>
  );
} 