import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface UseMatchPollerProps {
  username: string;
  isWaiting: boolean;
  roomName: string;
  onMatchFound?: (newRoomName: string) => void;
}

export function useMatchPoller({ 
  username, 
  isWaiting, 
  roomName, 
  onMatchFound 
}: UseMatchPollerProps) {
  const router = useRouter();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  const checkForMatch = useCallback(async () => {
    if (!isWaiting || isPollingRef.current) {
      return;
    }

    isPollingRef.current = true;

    try {
      console.log(`Checking for new match for ${username} in room ${roomName}`);
      
      const response = await fetch('/api/check-match-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          roomName
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'matched' && data.newRoomName && data.matchedWith) {
          console.log(`New match found! Room: ${data.newRoomName}, Partner: ${data.matchedWith}`);
          
          // Stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          
          // Navigate to the new room or call the callback
          if (onMatchFound) {
            onMatchFound(data.newRoomName);
          } else {
            router.push(`/video-chat/room/${data.newRoomName}?username=${encodeURIComponent(username)}`);
          }
        }
      }
    } catch (error) {
      console.error('Error checking for match:', error);
    } finally {
      isPollingRef.current = false;
    }
  }, [username, isWaiting, roomName, router, onMatchFound]);

  useEffect(() => {
    if (isWaiting) {
      console.log(`Starting match polling for ${username}`);
      
      // Start polling every 3 seconds
      pollingIntervalRef.current = setInterval(checkForMatch, 3000);
      
      // Also check immediately
      checkForMatch();
    } else {
      // Stop polling when not waiting
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, [isWaiting, checkForMatch, username]);

  return { checkForMatch };
} 