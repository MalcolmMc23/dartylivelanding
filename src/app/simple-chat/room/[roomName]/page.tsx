"use client";

import { useParams, useSearchParams } from "next/navigation";
import { SimpleRoomComponent } from "@/components/SimpleRoomComponent";

export default function SimpleRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const roomName = decodeURIComponent(params.roomName as string);
  const username = searchParams.get("username") || "";
  const matchedWith = searchParams.get("matchedWith") || "";
  const useDemo = searchParams.get("useDemo") === "true";

  if (!username || !matchedWith) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Missing Parameters
          </h1>
          <p className="text-gray-600">
            Username and matched user are required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SimpleRoomComponent
      roomName={roomName}
      username={username}
      matchedWith={matchedWith}
      useDemo={useDemo}
      onDisconnect={() => {
        console.log("User disconnected from room");
      }}
      onSkip={() => {
        console.log("User skipped match");
      }}
      onLeave={() => {
        console.log("User left match");
      }}
    />
  );
}
