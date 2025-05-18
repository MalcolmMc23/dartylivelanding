"use client";

import { useEffect, useRef } from "react";

/**
 * This component helps stabilize room connections by preventing unmounting
 * during critical connection periods
 */
export function StableRoomConnector({
  username,
  roomName,
}: {
  username: string;
  roomName: string;
}) {
  const mountTimeRef = useRef(Date.now());
  const stableRef = useRef(false);
  const connectionStabilizingRef = useRef(true);

  // Prevent disconnections during navigation
  useEffect(() => {
    console.log(
      `StableRoomConnector: Stabilizing connection for ${username} in room ${roomName}`
    );

    // Mark the connection as stabilizing for a longer period (10 seconds)
    // This prevents reconnections from happening too quickly
    connectionStabilizingRef.current = true;

    // Store connection info in sessionStorage so we can recover if needed
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("currentRoom", roomName);
      window.sessionStorage.setItem("currentUsername", username);

      // Clear any previous skipDisconnect flag to ensure we start fresh
      window.sessionStorage.removeItem("skipDisconnect");
    }

    const stabilizationTimer = setTimeout(() => {
      stableRef.current = true;
      connectionStabilizingRef.current = false;
      console.log(`Connection stabilized for ${username} in room ${roomName}`);
    }, 10000); // 10 seconds to ensure a stable connection

    // Capture the mount time value in the effect
    const mountTime = mountTimeRef.current;

    return () => {
      clearTimeout(stabilizationTimer);

      // Only send disconnect if component was mounted for a reasonable time
      // This prevents flickering connect/disconnect during page transitions
      const unmountTime = Date.now();
      const mountDuration = unmountTime - mountTime;

      if (mountDuration < 5000) {
        // Increased from 3000 to 5000 ms
        console.log(
          `Skipping disconnect for ${username} - component was only mounted for ${mountDuration}ms`
        );

        // Prevent disconnection by setting a flag in sessionStorage
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("skipDisconnect", "true");
          window.sessionStorage.setItem("reconnectToRoom", roomName);
          window.sessionStorage.setItem("reconnectUsername", username);

          // Clear the flag after a much longer delay to ensure it's present
          // during the entire unmount and remount cycle
          const clearSkipFlag = () => {
            console.log(`Clearing skipDisconnect flag for ${username}`);
            window.sessionStorage.removeItem("skipDisconnect");
          };

          // Use a longer timeout and store it in the window object to prevent garbage collection
          // @ts-expect-error - This is intentionally attached to window
          window.skipDisconnectTimer = setTimeout(clearSkipFlag, 15000); // Increased from 10000 to 15000 ms
        }
      } else if (stableRef.current) {
        console.log(`Clean unmount for ${username} after ${mountDuration}ms`);
        // Clear connection info since this is a clean disconnect
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("currentRoom");
          window.sessionStorage.removeItem("currentUsername");
          window.sessionStorage.removeItem("skipDisconnect");

          // Clear any existing skip disconnect timer
          // @ts-expect-error - This is intentionally attached to window
          if (window.skipDisconnectTimer) {
            // @ts-expect-error - This is intentionally attached to window
            clearTimeout(window.skipDisconnectTimer);
          }
        }
      }
    };
  }, [username, roomName]);

  // This component doesn't render anything
  return null;
}
