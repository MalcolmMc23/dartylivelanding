"use client";

import { useEffect, useState, useRef } from "react";
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
  const mountedRef = useRef(false);
  const loadingRef = useRef(true);

  // This effect runs once on mount to prevent flickering and remounting
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      console.log("Room page mounted - preventing remounts");

      // Store that we've loaded this room in sessionStorage
      // This helps prevent navigation issues
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("roomPageMounted", "true");
      }
    }

    // Simulated loading delay to ensure component stability
    const timer = setTimeout(() => {
      loadingRef.current = false;
      console.log("Room page loading complete");
    }, 1000);

    return () => {
      clearTimeout(timer);
      console.log("Room page unmounting");
    };
  }, []);

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

    // Log important information to help with debugging
    console.log(
      `Room page initialized with username: ${usernameParam}, room: ${roomId}`
    );
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
          console.log(
            `User ${username} manually disconnected, navigating back`
          );
          router.push(`/video-chat?username=${encodeURIComponent(username)}`);
        }}
      />
    </NoSSR>
  );
}
