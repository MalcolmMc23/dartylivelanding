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

  // Prevent disconnections during navigation
  useEffect(() => {
    console.log(
      `StableRoomConnector: Stabilizing connection for ${username} in room ${roomName}`
    );

    const stabilizationTimer = setTimeout(() => {
      stableRef.current = true;
      console.log(`Connection stabilized for ${username} in room ${roomName}`);
    }, 5000); // 5 seconds should be enough for connection to stabilize

    // Capture the mount time value in the effect
    const mountTime = mountTimeRef.current;

    return () => {
      clearTimeout(stabilizationTimer);

      // Only send disconnect if component was mounted for a reasonable time
      // This prevents flickering connect/disconnect during page transitions
      const unmountTime = Date.now();
      const mountDuration = unmountTime - mountTime;

      if (mountDuration < 3000) {
        console.log(
          `Skipping disconnect for ${username} - component was only mounted for ${mountDuration}ms`
        );

        // Prevent disconnection by setting a flag in sessionStorage
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("skipDisconnect", "true");
          // Clear the flag after a short delay
          setTimeout(() => {
            window.sessionStorage.removeItem("skipDisconnect");
          }, 5000);
        }
      } else if (stableRef.current) {
        console.log(`Clean unmount for ${username} after ${mountDuration}ms`);
      }
    };
  }, [username, roomName]);

  // This component doesn't render anything
  return null;
}
