"use client";

import { useEffect, useRef } from "react";

interface ConnectionManagerProps {
  username: string;
  roomName: string;
  onConnectionStable: () => void;
  onConnectionLost: () => void;
}

export function SimpleConnectionManager({
  username,
  roomName,
  onConnectionStable,
  onConnectionLost,
}: ConnectionManagerProps) {
  const connectionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isStableRef = useRef(false);

  useEffect(() => {
    // Mark connection as stable after 5 seconds
    connectionTimeoutRef.current = setTimeout(() => {
      isStableRef.current = true;
      onConnectionStable();
    }, 5000);

    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }

      // Only trigger disconnection if connection was stable
      if (isStableRef.current) {
        onConnectionLost();
      }
    };
  }, [username, roomName, onConnectionStable, onConnectionLost]);

  return null; // This component doesn't render anything
}
