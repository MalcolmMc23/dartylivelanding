"use client";

import { useState } from "react";
import RoomComponent from "@/components/RoomComponent";

export default function VideoChat() {
  const [roomName, setRoomName] = useState("");
  const [username, setUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);

  const joinRoom = () => {
    if (roomName && username) {
      setIsJoined(true);
    }
  };

  const createRoom = () => {
    // Create a random room code
    const newRoomCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
    setRoomName(newRoomCode);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white p-4 md:p-8 font-[family-name:var(--font-geist-sans)]">
      {!isJoined ? (
        <div className="w-full max-w-md p-6 bg-[#1E1E1E] rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-6 text-center">
            Darty<span className="text-[#A0FF00]">.live</span> Chat
          </h1>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Your Name</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 border rounded bg-[#2A2A2A] border-[#3A3A3A] text-white"
              placeholder="Enter your name"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Room Code</label>
            <div className="flex">
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full p-2 border rounded-l bg-[#2A2A2A] border-[#3A3A3A] text-white"
                placeholder="Enter room code"
              />
              <button
                onClick={createRoom}
                className="bg-[#2A2A2A] text-white px-4 py-2 rounded-r border-l-0 border border-[#3A3A3A] hover:bg-[#3A3A3A]"
              >
                Generate
              </button>
            </div>
          </div>

          <button
            onClick={joinRoom}
            disabled={!roomName || !username}
            className="w-full bg-[#A0FF00] text-black p-2 rounded font-semibold disabled:bg-[#4A4A4A] disabled:text-[#8A8A8A]"
          >
            Join Room
          </button>
        </div>
      ) : (
        <RoomComponent roomName={roomName} username={username} />
      )}
    </div>
  );
}
