"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import WaitingRoomComponent from "@/components/WaitingRoomComponent";
import { useSearchParams, useRouter } from "next/navigation";
import NoSSR from "@/components/NoSSR";
import { AdminDebugPanel } from "@/components/AdminDebugPanel";
import { useSession } from "next-auth/react";
import { LoginDialog } from "@/components/auth/LoginDialog";
import AnimatedStars from "@/components/AnimatedStars";

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
        <VideoRoomManager />
        <AdminDebugPanel />
      </Suspense>
    </NoSSR>
  );
}

// Create a separate client component to handle the search params
// Move lines array outside the component to avoid re-creation on every render
const TYPEWRITER_LINES = ["Welcome to", "DormParty", ".live"];

function Typewriter({
  delay = 40,
  lineDelay = 600,
  className = "",
}: {
  delay?: number;
  lineDelay?: number;
  className?: string;
}) {
  // Use the static lines array
  const lines = TYPEWRITER_LINES;
  const [displayed, setDisplayed] = useState([""]);
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);

  useEffect(() => {
    if (lineIdx < lines.length) {
      if (charIdx < lines[lineIdx].length) {
        const timeout = setTimeout(() => {
          setDisplayed((prev) => {
            const newLines = [...prev];
            newLines[lineIdx] = (newLines[lineIdx] || "") + lines[lineIdx][charIdx];
            return newLines;
          });
          setCharIdx((c) => c + 1);
        }, delay);
        return () => clearTimeout(timeout);
      } else if (lineIdx + 1 < lines.length) {
        const timeout = setTimeout(() => {
          setDisplayed((prev) => [...prev, ""]);
          setLineIdx((l) => l + 1);
          setCharIdx(0);
        }, lineDelay);
        return () => clearTimeout(timeout);
      }
    }
  }, [charIdx, lineIdx, lines, delay, lineDelay]);

  return (
    <div className={className}>
      {/* Welcome to */}
      <div className="text-lg md:text-xl font-medium mb-1">
        {displayed[0]}
        {lineIdx === 0 && <span className="animate-pulse">|</span>}
      </div>
      {/* DormParty.live */}
      <div className="text-2xl md:text-3xl font-bold tracking-tight">
        <span className="text-white">
          {displayed[1]}
          {lineIdx === 1 && <span className="animate-pulse">|</span>}
        </span>
        <span className="text-[#A855F7]">
          {lineIdx > 1 ? displayed[2] : ""}
          {lineIdx === 2 && <span className="animate-pulse">|</span>}
        </span>
      </div>
    </div>
  );
}

function VideoRoomManager() {
  const [, setRoomName] = useState("");
  const [username, setUsername] = useState("");
  const [usingDemoServer, setUsingDemoServer] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();
  const resetProcessedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const findRandomChatRef = useRef<() => void>(() => {});

  

  const handleFindChatClick = () => {
    if (!session) {
      setShowLoginDialog(true);
    } else {
      findRandomChat();
    }
  };

  // Define findRandomChat with useCallback
  const findRandomChat = useCallback(
    async (usernameToUse?: string) => {
      const finalUsername = usernameToUse || username;
      if (!finalUsername) return;

      setError("");
      setIsWaiting(true);

      try {
        // Call the API to either join the waiting queue or get matched immediately
        const response = await fetch("/api/match-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: finalUsername,
            useDemo: usingDemoServer,
            // Add a flag to indicate if this is a "rematch" after being left alone
            isRematching: searchParams.get("autoMatch") === "true",
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Match response:", data);

        if (data.status === "matched") {
          // We got matched immediately!
          setRoomName(data.roomName);
          setUsingDemoServer(data.useDemo); // Use the demo setting that was decided
          setIsWaiting(false);
          // Navigate to the canonical room route
          router.push(
            `/video-chat/room/${data.roomName}?username=${encodeURIComponent(
              finalUsername
            )}`
          );
        } else if (data.status === "waiting") {
          // We're in the waiting queue
          console.log("Added to waiting queue, waiting for match...");
          // Stay in waiting state, the polling will check for updates
        } else if (data.error) {
          throw new Error(data.error);
        }
      } catch (error) {
        console.error("Error finding random chat:", error);
        setError(
          `Failed to find chat: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        setIsWaiting(false);
      }
    },
    [usingDemoServer, username, searchParams, router]
  );

  // Store the latest findRandomChat in a ref to avoid stale closure
  useEffect(() => {
    findRandomChatRef.current = () => findRandomChat();
  }, [findRandomChat]);

  // Check if this is an auto-match redirect
  useEffect(() => {
    console.log(
      "Checking URL parameters for auto-matching, direct join, and reset flags"
    );
    const roomNameFromUrl = searchParams.get("roomName");
    const usernameFromUrl = searchParams.get("username");
    const autoMatch = searchParams.get("autoMatch");
    const reset = searchParams.get("reset");
    const useDemoFromUrl = searchParams.get("useDemo") === "true"; // Check for demo flag

    // Handle reset first
    if (reset === "true" && !resetProcessedRef.current) {
      console.log("Reset parameter detected - clearing all state");
      resetProcessedRef.current = true;

      const currentUsername = username || usernameFromUrl || "";

      setRoomName("");
      setIsWaiting(false);
      setError("");

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("reset");
        if (currentUsername) {
          url.searchParams.set("username", currentUsername);
          setUsername(currentUsername);
        }
        window.history.replaceState({}, "", url.toString());
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
          }
        }, 100);
      }
      return; // Exit early
    }
    if (reset !== "true") {
      resetProcessedRef.current = false;
    }

    // Handle direct join if roomName and username are in URL (and not resetting or auto-matching implicitly)
    if (roomNameFromUrl && usernameFromUrl && !autoMatch && reset !== "true") {
      console.log(
        `Direct join requested for room: ${roomNameFromUrl}, user: ${usernameFromUrl}`
      );
      setRoomName(roomNameFromUrl);
      setUsername(usernameFromUrl);
      setUsingDemoServer(useDemoFromUrl);
      // Navigate directly to the canonical room route instead of rendering here
      router.push(
        `/video-chat/room/${roomNameFromUrl}?username=${encodeURIComponent(
          usernameFromUrl
        )}`
      );
      return; // Important to return to prevent other logic paths
    }

    // Handle auto-match (only if not already handled by direct join)
    if (autoMatch === "true" && usernameFromUrl && reset !== "true") {
      console.log(
        `Auto-match explicitly requested for user: ${usernameFromUrl}`
      );

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("autoMatch");
        url.searchParams.delete("timestamp"); // Assuming timestamp was for uniqueness
        window.history.replaceState({}, "", url.toString());
      }
      // Ensure username state is set if not already by previous conditions
      if (!username) setUsername(usernameFromUrl);
      // Set usingDemoServer if present in autoMatch URL
      if (searchParams.has("useDemo")) {
        setUsingDemoServer(searchParams.get("useDemo") === "true");
      }

      setTimeout(() => {
        console.log(`Triggering auto-match for ${usernameFromUrl}`);
        findRandomChat(usernameFromUrl); // Pass username explicitly
      }, 800);
      return; // Return after initiating auto-match
    }

    // Set username if only username is present (and not other conditions met)
    if (usernameFromUrl && reset !== "true" && !autoMatch && !roomNameFromUrl) {
      console.log(
        `Username found in URL: ${usernameFromUrl}, setting username state (not auto-matching or direct joining)`
      );
      setUsername(usernameFromUrl);
      // Set usingDemoServer if present
      if (searchParams.has("useDemo")) {
        setUsingDemoServer(searchParams.get("useDemo") === "true");
      }
    } else if (
      !usernameFromUrl &&
      !roomNameFromUrl &&
      !autoMatch &&
      reset !== "true"
    ) {
      console.log(
        "No direct join, auto-match, or relevant username parameters found"
      );
    }
  }, [searchParams, findRandomChat, username, router]); // Ensure all dependencies are listed

  // Function to poll status while waiting
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isWaiting && username) {
      // Initial check immediately when entering waiting state
      const checkStatus = async () => {
        try {
          const response = await fetch(
            `/api/match-user?username=${encodeURIComponent(username)}`
          );
          const data = await response.json();

          console.log("Poll status:", data);

          if (data.status === "matched") {
            // User has been matched with someone!
            console.log(
              `Matched with ${data.matchedWith} in room ${data.roomName}`
            );
            setIsWaiting(false);
            setUsingDemoServer(data.useDemo);
            router.push(
              `/video-chat/room/${data.roomName}?username=${encodeURIComponent(
                username
              )}`
            );
          } else if (data.status === "not_waiting") {
            // This could happen if the server restarted or the user's session expired
            console.log("User no longer in waiting queue, cancelling wait");
            setIsWaiting(false);
            setError("Lost your place in the queue. Please try again.");
          }
        } catch (error) {
          console.error("Error polling status:", error);
        }
      };

      // Check immediately
      checkStatus();

      // Then poll regularly
      intervalId = setInterval(checkStatus, 2000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isWaiting, username, router]);

  const cancelWaiting = async () => {
    if (username && isWaiting) {
      try {
        // Call the API to cancel waiting
        const response = await fetch("/api/cancel-match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username }),
        });

        if (!response.ok) {
          console.error("Failed to cancel matching:", response.statusText);
        } else {
          console.log("Successfully canceled matching");
        }
      } catch (error) {
        console.error("Error canceling wait:", error);
      }
    }
    setIsWaiting(false);
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
      {/* Animated stars background */}
      <AnimatedStars />
      {/* Main content above stars */}
      {isWaiting ? (
        <WaitingRoomComponent username={username} onCancel={cancelWaiting} />
      ) : (
        <div className="relative z-10 w-full max-w-md p-8 bg-[#1A1A1A] rounded-2xl shadow-2xl backdrop-blur-sm border border-[#2A2A2A]">
          {/* --- Animated Typewriter with color split for DormParty.live --- */}
          <Typewriter className="mb-14 text-center" />
          {/* --- End Typewriter --- */}

          {error && (
            <div className="mb-4 flex items-center gap-3 p-4 rounded-lg bg-[#1a1a1a] border border-[#ff3b3b] shadow-sm">
              <svg
                className="w-5 h-5 text-[#ff3b3b] flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <line
                  x1="18"
                  y1="6"
                  x2="6"
                  y2="18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <line
                  x1="6"
                  y1="6"
                  x2="18"
                  y2="18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-base font-bold text-white">{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <button
              onClick={() => {
                handleFindChatClick();
              }}
              className="w-full bg-[#A855F7] text-white px-3.5 py-4 rounded-xl font-semibold hover:cursor-pointer hover:bg-[#9333EA] transition-all duration-200 shadow-lg shadow-[#A855F7]/20"
            >
              Find Random Chat
            </button>
          </div>
        </div>
      )}
      <LoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        onSuccess={() => {
          setShowLoginDialog(false);
          // Call findRandomChat after successful login
          findRandomChatRef.current();
        }}
      />
    </div>
  );
}
