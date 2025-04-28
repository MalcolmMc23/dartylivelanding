"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  ControlBar,
  useConnectionState,
  useRoomContext,
} from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  Participant,
  RemoteParticipant,
} from "livekit-client";

interface RoomComponentProps {
  roomName: string;
  username: string;
  useDemo?: boolean;
}

// Define interface for debug info
interface DebugInfo {
  room: string;
  username: string;
  apiKeyDefined: boolean;
  secretDefined: boolean;
  tokenGenerated: boolean;
  usingDemo?: boolean;
  currentParticipants?: string[];
}

// Max participants allowed in a room
const MAX_PARTICIPANTS = 2;

// Connection state logging component
function ConnectionStateLogger({
  onParticipantCountChange,
  maxParticipants,
  username,
}: {
  onParticipantCountChange: (count: number) => void;
  maxParticipants: number;
  username: string;
}) {
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const [isRoomFull, setIsRoomFull] = useState(false);

  // Function to check if room is at capacity
  const checkRoomCapacity = useCallback(() => {
    const participantCount = room.remoteParticipants.size + 1; // +1 for local participant
    console.log(
      `Room capacity check: ${participantCount}/${maxParticipants} participants`
    );

    const participantList = Array.from(room.remoteParticipants.values()).map(
      (p: RemoteParticipant) => p.identity
    );
    console.log("Current participants:", [
      room.localParticipant.identity,
      ...participantList,
    ]);

    onParticipantCountChange(participantCount);

    // Room is full if we have more than the max allowed participants
    // and we're not already in the list (to handle reconnections)
    if (participantCount > maxParticipants) {
      console.log("Room is over capacity!");
      setIsRoomFull(true);

      // Determine if we should disconnect (we're the newest participant)
      const shouldDisconnect = !participantList.includes(username);
      if (shouldDisconnect) {
        console.log("We appear to be the newest participant, disconnecting");
        room.disconnect();
      }
    } else {
      setIsRoomFull(false);
    }
  }, [room, maxParticipants, onParticipantCountChange, username]);

  useEffect(() => {
    console.log(`Connection state changed: ${connectionState}`);

    if (connectionState === ConnectionState.Connected) {
      console.log("Successfully connected to LiveKit room!");
      console.log(`Room name: ${room.name}`);
      console.log(`Local participant: ${room.localParticipant.identity}`);

      // Initial capacity check
      checkRoomCapacity();
    }

    // Set up event listeners for participants
    const onParticipantConnected = (participant: Participant) => {
      console.log(`Participant connected: ${participant.identity}`);
      checkRoomCapacity();
    };

    const onParticipantDisconnected = (participant: Participant) => {
      console.log(`Participant disconnected: ${participant.identity}`);
      checkRoomCapacity();
    };

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);

    // Monitor connection state changes
    const handleConnectionStateChanged = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        checkRoomCapacity();
      }
    };

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);

    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    };
  }, [connectionState, room, checkRoomCapacity]);

  // Render room full message if applicable
  if (isRoomFull && connectionState === ConnectionState.Disconnected) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50">
        <div className="bg-[#1E1E1E] p-6 rounded-lg max-w-md text-center">
          <h2 className="text-xl font-bold text-red-500 mb-4">Room Full</h2>
          <p className="mb-4">
            This room already has the maximum of {maxParticipants} participants.
          </p>
          <p className="text-sm text-gray-400">
            Please try again later or join a different room.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default function RoomComponent({
  roomName,
  username,
  useDemo = false,
}: RoomComponentProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [usingDemoServer, setUsingDemoServer] = useState(useDemo);
  const [liveKitUrl, setLiveKitUrl] = useState("");
  const [participantCount, setParticipantCount] = useState(0);

  // Get token from the API - using useCallback to memoize the function
  const fetchToken = useCallback(
    async (useDemoServer: boolean) => {
      setIsLoading(true);
      setError("");

      try {
        // Ensure room name is sanitized
        const safeRoomName = roomName.replace(/[^a-zA-Z0-9-]/g, "");
        if (safeRoomName.length === 0) {
          setError(
            "Invalid room name. Please use only letters, numbers, and hyphens."
          );
          setIsLoading(false);
          return false;
        }

        console.log(
          `Attempting to get token for room: ${safeRoomName}, user: ${username}, useDemo: ${useDemoServer}`
        );

        // Set LiveKit URL immediately based on demo status
        if (useDemoServer) {
          setLiveKitUrl("wss://demo.livekit.cloud");
        } else {
          const publicUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
          setLiveKitUrl(publicUrl);
          console.log(`Using configured LiveKit URL: ${publicUrl}`);
        }

        const response = await fetch(
          `/api/get-livekit-token?room=${safeRoomName}&username=${username}&useDemo=${useDemoServer}`
        );
        const data = await response.json();

        if (data.error) {
          console.error(`Token error: ${data.error}`);
          // Set specific error message for room full condition
          if (data.error.includes("Room is full")) {
            setError(
              "This room is already full (maximum 2 participants allowed). Please try a different room."
            );
          } else {
            setError(`Failed to get token: ${data.error}`);
          }
          return false;
        }

        console.log("Successfully received token");

        // Log the debug info
        if (data.debug) {
          console.log("Debug info:", data.debug);
          setDebugInfo(data.debug);

          // Update participant count if available
          if (data.participantCount !== undefined) {
            setParticipantCount(data.participantCount);
            console.log(
              `Initial participant count from server: ${data.participantCount}`
            );
          }
        }

        // Make sure the token is a string
        if (typeof data.token === "string") {
          console.log(`Token received (length: ${data.token.length})`);
          setToken(data.token);
          return true;
        } else {
          console.error("Invalid token format received:", typeof data.token);
          setError("Invalid token format received from server");
          return false;
        }
      } catch (error: unknown) {
        console.error("Failed to get token:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setError(`Error fetching token: ${errorMessage}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [roomName, username]
  );

  // Initial token fetch
  useEffect(() => {
    fetchToken(usingDemoServer);
  }, [fetchToken, usingDemoServer]);

  // Initialize demo state from prop
  useEffect(() => {
    setUsingDemoServer(useDemo);
  }, [useDemo]);

  // Toggle between normal and demo server
  const toggleDemoServer = async () => {
    setUsingDemoServer(!usingDemoServer);
  };

  // Try connection again
  const retryConnection = async () => {
    await fetchToken(usingDemoServer);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#121212] text-white">
        <div className="p-6 bg-[#1E1E1E] rounded-lg max-w-md text-center">
          <h2 className="text-xl font-bold text-red-500 mb-4">
            Connection Error
          </h2>
          <p className="mb-4">{error}</p>
          <p className="text-sm text-gray-400 mb-4">
            Check the browser console for more details
          </p>

          {debugInfo && (
            <div className="mt-4 text-left text-xs bg-[#0E0E0E] p-3 rounded overflow-auto max-h-48">
              <p className="font-bold mb-1">Debug Info:</p>
              <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-4">
            <button
              onClick={retryConnection}
              className="px-4 py-2 bg-[#A0FF00] text-black rounded hover:bg-opacity-90"
            >
              Try Again
            </button>

            <button
              onClick={toggleDemoServer}
              className="px-4 py-2 bg-[#2A2A2A] text-white rounded hover:bg-[#3A3A3A]"
            >
              {usingDemoServer
                ? "Use Your LiveKit Server"
                : "Try LiveKit Demo Server"}
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            {usingDemoServer
              ? "Using LiveKit demo server (limited functionality)"
              : "Using your configured LiveKit server"}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !token) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#A0FF00]"></div>
      </div>
    );
  }

  // Log environment variables (client-side only sees NEXT_PUBLIC_* vars)
  console.log(`LiveKit URL being used: ${liveKitUrl}`);

  return (
    <div className="w-full h-screen bg-[#121212]">
      {token && liveKitUrl && (
        <LiveKitRoom
          token={token}
          serverUrl={liveKitUrl}
          connect={true}
          // Start with audio/video disabled to avoid permissions issues
          video={false}
          audio={false}
          onError={(err) => {
            console.error("LiveKit connection error:", err);
            setError(`LiveKit connection error: ${err.message}`);
          }}
        >
          <ConnectionStateLogger
            onParticipantCountChange={setParticipantCount}
            maxParticipants={MAX_PARTICIPANTS}
            username={username}
          />
          <div className="h-full flex flex-col relative">
            {usingDemoServer && (
              <div className="absolute top-2 left-0 right-0 z-10 flex justify-center">
                <div className="px-3 py-1 bg-yellow-600 text-white text-xs rounded-full">
                  Demo Server Mode
                </div>
              </div>
            )}

            <div className="absolute top-2 right-2 z-10">
              <div className="px-3 py-1 bg-[#2A2A2A] text-white text-xs rounded-full flex items-center">
                <span className="font-medium mr-1">Participants:</span>
                <span
                  className={`font-bold ${
                    participantCount >= MAX_PARTICIPANTS
                      ? "text-[#A0FF00]"
                      : "text-white"
                  }`}
                >
                  {participantCount}/{MAX_PARTICIPANTS}
                </span>
              </div>
            </div>

            <div className="flex-grow">
              <VideoConference />
            </div>
            <RoomAudioRenderer />
            <ControlBar />
          </div>
        </LiveKitRoom>
      )}
    </div>
  );
}
