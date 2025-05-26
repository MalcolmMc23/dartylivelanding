import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface UseUnifiedMatchPollerProps {
  username: string;
  isWaiting: boolean;
  onMatchFound?: (roomName: string, matchedWith: string, useDemo: boolean) => void;
  pollingInterval?: number;
}

export function useUnifiedMatchPoller({
  username,
  isWaiting,
  onMatchFound,
  pollingInterval = 2000
}: UseUnifiedMatchPollerProps) {
  const router = useRouter();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const hasMatchedRef = useRef(false);

  const checkForMatch = useCallback(async () => {
    if (!isWaiting || isPollingRef.current || hasMatchedRef.current || !username) {
      return;
    }

    isPollingRef.current = true;

    try {
      console.log(`[UnifiedMatchPoller] Checking for match for ${username}`);
      
      const response = await fetch('/api/check-user-match-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status === 'matched' && data.roomName && data.matchedWith) {
        console.log(`[UnifiedMatchPoller] Match found! ${username} matched with ${data.matchedWith} in room ${data.roomName}`);
        
        // Set flag to prevent further polling
        hasMatchedRef.current = true;
        
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        
        // Call callback or navigate
        if (onMatchFound) {
          onMatchFound(data.roomName, data.matchedWith, data.useDemo || false);
        } else {
          // Default navigation
          const roomUrl = `/video-chat/room/${data.roomName}?username=${encodeURIComponent(username)}`;
          console.log(`[UnifiedMatchPoller] Navigating to: ${roomUrl}`);
          router.push(roomUrl);
        }
      } else {
        console.log(`[UnifiedMatchPoller] No match yet for ${username}, status: ${data.status}`);
      }
    } catch (error) {
      console.error(`[UnifiedMatchPoller] Error checking for match:`, error);
    } finally {
      isPollingRef.current = false;
    }
  }, [username, isWaiting, router, onMatchFound]);

  useEffect(() => {
    if (isWaiting && username && !hasMatchedRef.current) {
      console.log(`[UnifiedMatchPoller] Starting match polling for ${username}`);
      
      // Clear any existing interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      
      // Start polling
      pollingIntervalRef.current = setInterval(checkForMatch, pollingInterval);
      
      // Also check immediately
      checkForMatch();
    } else {
      // Stop polling when not waiting or already matched
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
  }, [isWaiting, checkForMatch, username, pollingInterval]);

  // Reset matched flag when waiting state changes
  useEffect(() => {
    if (!isWaiting) {
      hasMatchedRef.current = false;
    }
  }, [isWaiting]);

  return { checkForMatch };
} 