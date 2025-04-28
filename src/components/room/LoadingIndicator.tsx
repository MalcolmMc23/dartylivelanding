"use client";

export function LoadingIndicator() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0C0C0C] text-white">
      <div className="relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-[#A0FF00] border-opacity-20 rounded-full"></div>
        </div>
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#A0FF00]"></div>
      </div>
      <p className="mt-6 text-xl font-medium">Connecting...</p>
      <p className="mt-2 text-sm text-gray-400">Initializing video chat</p>
    </div>
  );
}
