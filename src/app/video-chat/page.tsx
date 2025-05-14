"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import dynamic from "next/dynamic";
import WaitingRoomComponent from "@/components/WaitingRoomComponent";
import { useSearchParams } from "next/navigation";
import NoSSR from "@/components/NoSSR";

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
  // Track if we've just returned from a reset
  const [isPostReset, setIsPostReset] = useState(false);
  // Store the default username for the uncontrolled input to use
  const [defaultUsername, setDefaultUsername] = useState("");

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
    [usingDemoServer, username]
  );

  // Check if this is an auto-match redirect
  useEffect(() => {
    console.log("Checking URL parameters for auto-matching and reset flags");
    const autoMatch = searchParams.get("autoMatch");
    const usernameParam = searchParams.get("username");
    const reset = searchParams.get("reset");

    // Handle reset flag - clear all state, but only once per reset=true instance
    if (reset === "true" && !resetProcessedRef.current) {
      console.log("Reset parameter detected - clearing all state");
      resetProcessedRef.current = true;

      // Store current username before clearing state
      const currentUsername = username || usernameParam || "";

      // Clear all room state
      setRoomName("");
      setIsJoined(false);
      setUsingDemoServer(false);
      setIsWaiting(false);
      setError("");

      // Don't update the controlled username state directly
      // Instead, set the default value for the uncontrolled input
      setDefaultUsername(currentUsername);
      // Mark that we're in post-reset state to switch to uncontrolled input
      setIsPostReset(true);

      // Remove the reset parameter from the URL to prevent continuous resets
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("reset");
        // Preserve the username parameter
        if (currentUsername) {
          url.searchParams.set("username", currentUsername);
        }
        window.history.replaceState({}, "", url.toString());

        // Focus the input field after a short delay to ensure component is rendered
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 100);
      }

      return; // Exit early to prevent auto-matching
    }

    // Reset the resetProcessedRef when the reset parameter is no longer present
    if (reset !== "true") {
      resetProcessedRef.current = false;
    }

    // Only auto-match if explicitly requested with autoMatch=true parameter
    if (autoMatch === "true" && usernameParam) {
      console.log(`Auto-match explicitly requested for user: ${usernameParam}`);
      // Set username state immediately for controlled components if needed elsewhere
      setUsername(usernameParam);
      // Pass the username explicitly here as well, as state might not be updated yet
      setTimeout(() => {
        findRandomChat(usernameParam);
      }, 500);
    } else if (usernameParam && !isPostReset) {
      // If there's only a username but no autoMatch, and we are NOT in post-reset mode,
      // just set the username state. Avoid this if isPostReset is true, as the user
      // should be able to freely edit the uncontrolled input field.
      console.log(
        `Username found in URL: ${usernameParam}, setting username state (not auto-matching)`
      );
      setUsername(usernameParam);
    } else {
      console.log("No auto-match or relevant username parameters found");
    }
    // Add isPostReset to dependencies as its value affects the logic flow
  }, [searchParams, findRandomChat, username, isPostReset]);

  // Function to poll status while waiting
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isWaiting && username) {
      // Poll the status every 2 seconds
      intervalId = setInterval(async () => {
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
      }, 2000);
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
            {isPostReset ? (
              // When coming from reset, use an uncontrolled input that we can freely type in
              <input
                type="text"
                defaultValue={defaultUsername}
                onChange={(e) => {
                  // When user starts typing in the uncontrolled input, update the username state
                  // for when we need it later (e.g., for findRandomChat)
                  setUsername(e.target.value);
                }}
                className="w-full p-2 border rounded bg-[#2A2A2A] border-[#3A3A3A] text-white"
                placeholder="Enter your name"
                autoComplete="off"
                ref={inputRef}
                onFocus={() => {
                  // Make sure cursor is at the end of the text
                  if (inputRef.current) {
                    const val = inputRef.current.value;
                    inputRef.current.value = "";
                    inputRef.current.value = val;
                  }
                }}
                // Switch back to controlled component if user continues using the app
                onBlur={(e) => {
                  // Switch back to controlled mode after updating state
                  setUsername(e.target.value);
                  setIsPostReset(false);
                }}
              />
            ) : (
              // Normal controlled input for non-reset cases
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-2 border rounded bg-[#2A2A2A] border-[#3A3A3A] text-white"
                placeholder="Enter your name"
                autoComplete="off"
                ref={inputRef}
              />
            )}
          </div>

          <div className="flex flex-col gap-4 mb-6">
            <button
              onClick={() => {
                // If we're in post-reset mode, make sure to capture the latest input value
                let nameToUse = username;
                if (isPostReset && inputRef.current) {
                  nameToUse = inputRef.current.value;
                  setUsername(nameToUse);
                  setIsPostReset(false);
                }
                findRandomChat(nameToUse);
              }}
              disabled={!username && !(isPostReset && inputRef.current?.value)}
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
                      // If we're in post-reset mode, make sure to capture the latest input value
                      let nameToUse = username;
                      if (isPostReset && inputRef.current) {
                        nameToUse = inputRef.current.value;
                        setUsername(nameToUse);
                        setIsPostReset(false);
                      }
                      // Although joinRoom doesn't explicitly take username, it relies on the state
                      // Ensure state is updated before calling joinRoom
                      if (nameToUse !== username) setUsername(nameToUse);
                      joinRoom();
                    }}
                    disabled={
                      !roomName ||
                      (!username && !(isPostReset && inputRef.current?.value))
                    }
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
