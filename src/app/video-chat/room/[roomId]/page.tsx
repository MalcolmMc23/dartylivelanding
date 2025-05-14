"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import NoSSR from "@/components/NoSSR";

// Dynamically import the RoomComponent with no SSR to avoid hydration errors
const RoomComponent = dynamic(() => import("@/components/RoomComponent"), {
  ssr: false,
});

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);

  useEffect(() => {
    // Get username from search params
    const usernameParam = searchParams.get("username");
    const roomId = params.roomId as string;

    if (!usernameParam) {
      // Redirect back to video-chat if no username
      router.push("/video-chat");
      return;
    }

    if (!roomId) {
      // Redirect back to video-chat if no room ID
      router.push(`/video-chat?username=${encodeURIComponent(usernameParam)}`);
      return;
    }

    setUsername(usernameParam);
    setRoomName(roomId);
  }, [params, searchParams, router]);

  if (!username || !roomName) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="animate-spin h-8 w-8 border-4 border-white rounded-full border-t-transparent"></div>
      </div>
    );
  }

  return (
    <NoSSR
      fallback={
        <div className="h-screen w-full flex items-center justify-center bg-black">
          <div className="animate-spin h-8 w-8 border-4 border-white rounded-full border-t-transparent"></div>
        </div>
      }
    >
      <RoomComponent
        roomName={roomName}
        username={username}
        onDisconnect={() => {
          // Navigate back to video chat page when the user disconnects
          router.push(`/video-chat?username=${encodeURIComponent(username)}`);
        }}
      />
    </NoSSR>
  );
}
