"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import WaitingRoomComponent from "@/components/WaitingRoomComponent";
import { useSearchParams, useRouter } from "next/navigation";
import NoSSR from "@/components/NoSSR";
import { AdminDebugPanel } from "@/components/AdminDebugPanel";

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
function VideoRoomManager() {
  const [roomName, setRoomName] = useState("");
  const [username, setUsername] = useState("");
  const [usingDemoServer, setUsingDemoServer] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();
  const resetProcessedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const joinRoom = () => {
    if (roomName && username) {
      // Sanitize room name before joining
      const sanitizedRoom = roomName.replace(/[^a-zA-Z0-9-]/g, "");
      if (sanitizedRoom.length > 0) {
        if (sanitizedRoom !== roomName) {
          setRoomName(sanitizedRoom);
        }
        setIsWaiting(true);
        // Navigate to the canonical room route
        router.push(
          `/video-chat/room/${sanitizedRoom}?username=${encodeURIComponent(
            username
          )}`
        );
      }
    }
  };

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

  const toggleDemoServer = () => {
    setUsingDemoServer(!usingDemoServer);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
      {isWaiting ? (
        <WaitingRoomComponent username={username} onCancel={cancelWaiting} />
      ) : (
        <div className="w-full max-w-md p-8 bg-[#1A1A1A] rounded-2xl shadow-2xl backdrop-blur-sm border border-[#2A2A2A]">
          <h1 className="text-3xl font-bold mb-8 text-center tracking-tight">
            DormParty<span className="text-[#A855F7]">.live</span>
          </h1>

          {error && (
            <div className="mb-6 p-4 bg-red-900/20 rounded-xl text-red-400 text-sm border border-red-900/30">
              {error}
            </div>
          )}

          <div className="mb-8">
            <label className="block text-sm font-medium mb-2 text-gray-300">Your Name</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 border rounded-xl bg-[#2A2A2A] border-[#3A3A3A] text-white focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:border-transparent transition-all"
              placeholder="Enter your name"
              autoComplete="off"
              ref={inputRef}
            />
          </div>

          <div className="flex flex-col gap-4 mb-8">
            <button
              onClick={() => {
                findRandomChat();
              }}
              disabled={!username}
              className="w-full bg-[#A855F7] text-white p-3.5 rounded-xl font-semibold disabled:bg-[#2A2A2A] disabled:text-[#666666] disabled:cursor-not-allowed enabled:hover:cursor-pointer enabled:hover:bg-[#9333EA] transition-all duration-200 shadow-lg shadow-[#A855F7]/20"
            >
              Find Random Chat
            </button>

            <div className="text-center">
              <span className="text-gray-500">- or -</span>
            </div>

            <div className="relative">
              <details className="w-full">
                <summary className="cursor-pointer p-2 text-center text-sm text-gray-400 hover:text-white transition-colors">
                  Join with room code (advanced)
                </summary>
                <div className="mt-4 p-6 bg-[#1E1E1E] rounded-xl border border-[#2A2A2A]">
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2 text-gray-300">
                      Room Code
                    </label>
                    <div className="flex">
                      <input
                        type="text"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        className="w-full p-3 border rounded-l-xl bg-[#2A2A2A] border-[#3A3A3A] text-white focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:border-transparent transition-all"
                        placeholder="Enter room code"
                      />
                      <button
                        onClick={() => {
                          const newRoomCode = Math.random()
                            .toString(36)
                            .substring(2, 8)
                            .toUpperCase();
                          setRoomName(newRoomCode);
                        }}
                        className="bg-[#2A2A2A] text-white px-4 py-3 rounded-r-xl border-l-0 border border-[#3A3A3A] hover:bg-[#3A3A3A] transition-colors"
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      joinRoom();
                    }}
                    disabled={!roomName || !username}
                    className="w-full bg-[#2A2A2A] text-white p-3 rounded-xl font-semibold hover:bg-[#3A3A3A] disabled:bg-[#1A1A1A] disabled:text-[#4A4A4A] transition-all duration-200"
                  >
                    Join Specific Room
                  </button>
                </div>
              </details>
            </div>
          </div>

          <div className="flex items-center mb-2 text-sm text-gray-300">
            <input
              type="checkbox"
              id="demoServer"
              checked={usingDemoServer}
              onChange={toggleDemoServer}
              className="mr-2 accent-[#A855F7]"
            />
            <label htmlFor="demoServer">
              Use LiveKit demo server (more reliable for testing)
            </label>
          </div>

          {usingDemoServer && (
            <div className="mt-4 p-4 bg-[#A855F7]/10 rounded-xl text-[#A855F7] text-xs border border-[#A855F7]/20">
              <p className="font-semibold">Using LiveKit Demo Server</p>
              <p className="mt-1 text-[#A855F7]/80">
                This mode uses LiveKit&apos;s public demo server instead of your
                configured server. It&apos;s useful for testing if you&apos;re
                having connection issues.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
