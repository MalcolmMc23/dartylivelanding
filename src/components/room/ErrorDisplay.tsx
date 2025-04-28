"use client";

import { DebugInfo } from "./types";
import { cn } from "@/lib/utils";

interface ErrorDisplayProps {
  error: string;
  debugInfo: DebugInfo | null;
  usingDemoServer: boolean;
  retryConnection: () => void;
  toggleDemoServer: () => void;
}

export function ErrorDisplay({
  error,
  debugInfo,
  usingDemoServer,
  retryConnection,
  toggleDemoServer,
}: ErrorDisplayProps) {
  return (
    <div className="flex items-center justify-center h-screen bg-[#0C0C0C] text-white">
      <div className="p-8 bg-[#1A1A1A] rounded-xl max-w-md text-center shadow-2xl border border-[#2A2A2A]">
        <div className="w-16 h-16 bg-red-500 bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-red-400 mb-4">
          Connection Error
        </h2>

        <p className="mb-6 text-lg">{error}</p>

        <p className="text-sm text-gray-400 mb-6">
          Check the browser console for more details
        </p>

        {debugInfo && (
          <div className="mt-4 text-left text-xs bg-[#0E0E0E] p-4 rounded-lg overflow-auto max-h-48 mb-6">
            <p className="font-bold mb-2 text-gray-300">Debug Info:</p>
            <pre className="text-gray-400">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-6">
          <button
            onClick={retryConnection}
            className={cn(
              "px-4 py-3 bg-gradient-to-r from-[#A0FF00] to-[#7DDF00] text-black rounded-lg",
              "font-semibold hover:brightness-110 transition-all duration-200"
            )}
          >
            Try Again
          </button>

          <button
            onClick={toggleDemoServer}
            className="px-4 py-3 bg-[#2A2A2A] text-white rounded-lg hover:bg-[#3A3A3A] transition-all duration-200"
          >
            {usingDemoServer
              ? "Use Your LiveKit Server"
              : "Try LiveKit Demo Server"}
          </button>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          {usingDemoServer
            ? "Using LiveKit demo server (limited functionality)"
            : "Using your configured LiveKit server"}
        </p>
      </div>
    </div>
  );
}
