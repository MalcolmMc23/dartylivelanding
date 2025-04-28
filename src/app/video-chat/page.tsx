"use client";

import { useState, useEffect } from "react";
import RoomComponent from "@/components/RoomComponent";
import WaitingRoomComponent from "@/components/WaitingRoomComponent";

export default function VideoChat() {
  const [roomName, setRoomName] = useState("");
  const [username, setUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [usingDemoServer, setUsingDemoServer] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState("");

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

  const findRandomChat = async () => {
    if (username) {
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
            username,
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
    }
  };

  const cancelWaiting = async () => {
    if (username && isWaiting) {
      try {
        // Call the API to cancel waiting
        await fetch(
          `/api/match-user?username=${encodeURIComponent(
            username
          )}&action=cancel`
        );
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
      {isJoined ? (
        <RoomComponent
          roomName={roomName}
          username={username}
          useDemo={usingDemoServer}
        />
      ) : isWaiting ? (
        <WaitingRoomComponent username={username} onCancel={cancelWaiting} />
      ) : (
        <div className="w-full max-w-md p-6 bg-[#1E1E1E] rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-6 text-center">
            Darty<span className="text-[#A0FF00]">.live</span> Chat
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
            />
          </div>

          <div className="flex flex-col gap-4 mb-6">
            <button
              onClick={findRandomChat}
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
                    onClick={joinRoom}
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
