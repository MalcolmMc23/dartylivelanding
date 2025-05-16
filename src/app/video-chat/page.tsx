"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import dynamic from "next/dynamic";
import WaitingRoomComponent from "@/components/WaitingRoomComponent";
import { useSearchParams } from "next/navigation";
import NoSSR from "@/components/NoSSR";
import { AdminDebugPanel } from "@/components/AdminDebugPanel";

// Dynamically import the RoomComponent with no SSR to avoid hydration errors
const RoomComponent = dynamic(() => import("@/components/RoomComponent"), {
  ssr: false,
});

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
  const [isJoined, setIsJoined] = useState(false);
  const [usingDemoServer, setUsingDemoServer] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
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
          setIsJoined(true);
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
    [usingDemoServer, username, searchParams]
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
      setIsJoined(false);
      setUsingDemoServer(false); // Reset demo server state
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
      setUsingDemoServer(useDemoFromUrl); // Set demo server based on URL
      setIsJoined(true);

      // Clean up URL params after processing direct join
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("roomName");
        url.searchParams.delete("useDemo"); // Clean up demo flag
        // Optionally keep username or remove it based on desired behavior after joining
        // url.searchParams.delete("username");
        window.history.replaceState({}, "", url.toString());
      }
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
  }, [searchParams, findRandomChat, username]); // Ensure all dependencies are listed

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
            setRoomName(data.roomName);
            setUsingDemoServer(data.useDemo);
            setIsWaiting(false);
            setIsJoined(true);
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
  }, [isWaiting, username]);

  const joinRoom = () => {
    if (roomName && username) {
      // Sanitize room name before joining
      const sanitizedRoom = roomName.replace(/[^a-zA-Z0-9-]/g, "");
      if (sanitizedRoom.length > 0) {
        if (sanitizedRoom !== roomName) {
          setRoomName(sanitizedRoom);
        }
        setIsJoined(true);
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

  // Handle disconnection from a chat
  const handleDisconnect = useCallback(() => {
    console.log("User disconnected, returning to initial screen");
    setIsJoined(false);
    setRoomName("");
    setIsWaiting(false);
    setError("");

    // Add the reset flag to the URL to ensure full state reset
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("reset", "true");
      url.searchParams.set("username", username);
      window.history.replaceState({}, "", url.toString());
    }
  }, [username]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
      {isJoined ? (
        <RoomComponent
          roomName={roomName}
          username={username}
          useDemo={usingDemoServer}
          onDisconnect={handleDisconnect}
        />
      ) : isWaiting ? (
        <WaitingRoomComponent username={username} onCancel={cancelWaiting} />
      ) : (
        <div className="w-full max-w-md p-6 bg-[#1E1E1E] rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-6 text-center">
            DormParty<span className="text-[#A0FF00]">.live</span> Chat
          </h1>

          {error && (
            <div className="mb-4 p-3 bg-red-900 bg-opacity-30 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Your Name</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 border rounded bg-[#2A2A2A] border-[#3A3A3A] text-white"
              placeholder="Enter your name"
              autoComplete="off"
              ref={inputRef}
            />
          </div>

          <div className="flex flex-col gap-4 mb-6">
            <button
              onClick={() => {
                findRandomChat();
              }}
              disabled={!username}
              className="w-full bg-[#A0FF00] text-black p-3 rounded font-semibold disabled:bg-[#4A4A4A] disabled:text-[#8A8A8A] hover:bg-opacity-90"
            >
              Find Random Chat
            </button>

            <div className="text-center">
              <span className="text-gray-400">- or -</span>
            </div>

            <div className="relative">
              <details className="w-full">
                <summary className="cursor-pointer p-2 text-center text-sm text-gray-400 hover:text-white">
                  Join with room code (advanced)
                </summary>
                <div className="mt-4 p-4 bg-[#1A1A1A] rounded-lg">
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">
                      Room Code
                    </label>
                    <div className="flex">
                      <input
                        type="text"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        className="w-full p-2 border rounded-l bg-[#2A2A2A] border-[#3A3A3A] text-white"
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
                        className="bg-[#2A2A2A] text-white px-4 py-2 rounded-r border-l-0 border border-[#3A3A3A] hover:bg-[#3A3A3A]"
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      // Just call joinRoom directly since we're using a controlled input
                      joinRoom();
                    }}
                    disabled={!roomName || !username}
                    className="w-full bg-[#2A2A2A] text-white p-2 rounded font-semibold hover:bg-[#3A3A3A] disabled:bg-[#1A1A1A] disabled:text-[#4A4A4A]"
                  >
                    Join Specific Room
                  </button>
                </div>
              </details>
            </div>
          </div>

          <div className="flex items-center mb-2 text-sm">
            <input
              type="checkbox"
              id="demoServer"
              checked={usingDemoServer}
              onChange={toggleDemoServer}
              className="mr-2"
            />
            <label htmlFor="demoServer">
              Use LiveKit demo server (more reliable for testing)
            </label>
          </div>

          {usingDemoServer && (
            <div className="mt-4 p-3 bg-yellow-900 bg-opacity-30 rounded text-yellow-400 text-xs">
              <p className="font-semibold">Using LiveKit Demo Server</p>
              <p className="mt-1">
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
