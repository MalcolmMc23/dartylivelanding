"use client";

import { Suspense } from "react";
import NoSSR from "@/components/NoSSR";
import { AdminDebugPanel } from "@/components/AdminDebugPanel";
import VideoChatHome from "./components/VideoChatHome";

// Wrap the main content in a client-side only component
export default function VideoChat() {
  return (
    <NoSSR
      fallback={
        <div className="h-screen w-full flex items-center justify-center bg-black">
          <div className="animate-spin h-8 w-8 border-4 border-white rounded-full border-t-transparent"></div>
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="h-screen w-full flex items-center justify-center bg-black">
            <div className="animate-spin h-8 w-8 border-4 border-white rounded-full border-t-transparent"></div>
          </div>
        }
      >
        <VideoChatHome />
        <AdminDebugPanel />
      </Suspense>
    </NoSSR>
  );
}
