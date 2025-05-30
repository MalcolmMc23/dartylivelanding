import { useState, useCallback, useEffect, useRef } from "react";
import { Room, RoomEvent, Participant, RemoteParticipant } from "livekit-client";

export interface UseLiveKitReturn {
  // State
  room: Room | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  localParticipant: Participant | null;
  remoteParticipants: RemoteParticipant[];
  
  // Actions
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

export function useLiveKit(): UseLiveKitReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localParticipant, setLocalParticipant] = useState<Participant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  
  // Ref to track the current room instance to prevent state updates after cleanup
  const roomRef = useRef<Room | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Update participants when room state changes
  const updateParticipants = useCallback((room: Room) => {
    setLocalParticipant(room.localParticipant);
    setRemoteParticipants(Array.from(room.remoteParticipants.values()));
  }, []);

  // Connect to LiveKit room
  const connect = useCallback(async (url: string, token: string) => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    setError(null);

    try {
      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: { width: 1280, height: 720 },
        },
      });

      roomRef.current = newRoom;

      // Set up event listeners
      newRoom.on(RoomEvent.Connected, () => {
        if (roomRef.current === newRoom) {
          setIsConnected(true);
          setRoom(newRoom);
          updateParticipants(newRoom);
        }
      });

      newRoom.on(RoomEvent.Disconnected, (reason) => {
        if (roomRef.current === newRoom) {
          console.log("Disconnected from room:", reason);
          setIsConnected(false);
          setRoom(null);
          setLocalParticipant(null);
          setRemoteParticipants([]);
        }
      });

      newRoom.on(RoomEvent.ParticipantConnected, () => {
        if (roomRef.current === newRoom) {
          updateParticipants(newRoom);
        }
      });

      newRoom.on(RoomEvent.ParticipantDisconnected, () => {
        if (roomRef.current === newRoom) {
          updateParticipants(newRoom);
        }
      });

      newRoom.on(RoomEvent.TrackSubscribed, () => {
        if (roomRef.current === newRoom) {
          updateParticipants(newRoom);
        }
      });

      newRoom.on(RoomEvent.TrackUnsubscribed, () => {
        if (roomRef.current === newRoom) {
          updateParticipants(newRoom);
        }
      });

      newRoom.on(RoomEvent.RoomMetadataChanged, () => {
        if (roomRef.current === newRoom) {
          updateParticipants(newRoom);
        }
      });

      // Connect to the room
      await newRoom.connect(url, token);

      // Enable camera and microphone
      await newRoom.localParticipant.enableCameraAndMicrophone();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to connect to room";
      setError(errorMessage);
      console.error("LiveKit connection error:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected, updateParticipants]);

  // Disconnect from LiveKit room
  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch (err) {
        console.error("Error disconnecting from room:", err);
      } finally {
        roomRef.current = null;
        setRoom(null);
        setIsConnected(false);
        setLocalParticipant(null);
        setRemoteParticipants([]);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, []);

  return {
    room,
    isConnecting,
    isConnected,
    error,
    localParticipant,
    remoteParticipants,
    connect,
    disconnect,
    clearError,
  };
} 