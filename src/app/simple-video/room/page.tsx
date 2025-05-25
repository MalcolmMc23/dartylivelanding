"use client";

import { useSearchParams } from "next/navigation";
import { SimpleVideoRoom } from "@/components/SimpleVideoRoom";
import { Card, CardContent } from "@/components/ui/card";
import { Suspense } from "react";

function RoomContent() {
  const searchParams = useSearchParams();

  const roomName = searchParams.get("roomName");
  const username = searchParams.get("username");
  const matchedWith = searchParams.get("matchedWith");
  const useDemo = searchParams.get("useDemo") === "true";
  const token = searchParams.get("token");
  const serverUrl = searchParams.get("serverUrl");

  // Validate required parameters
  if (!roomName || !username || !matchedWith || !token || !serverUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-bold text-red-600 mb-4">
              Invalid Room Access
            </h2>
            <p className="text-gray-600 mb-4">
              Missing required parameters to join the room.
            </p>
            <a href="/simple-video" className="text-blue-600 hover:underline">
              Return to main page
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SimpleVideoRoom
      roomName={roomName}
      username={username}
      matchedWith={matchedWith}
      useDemo={useDemo}
      token={token}
      serverUrl={serverUrl}
    />
  );
}

export default function SimpleVideoRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="text-white text-xl">Loading room...</div>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
