import { useState, useEffect, useCallback } from 'react';

interface LeftBehindStatus {
  isLeftBehind: boolean;
  newRoomName?: string;
  previousRoom?: string;
  disconnectedFrom?: string;
  timestamp?: number;
  isLoading: boolean;
  isMatched: boolean;
  matchedWith?: string;
  matchRoom?: string;
  error?: string;
  inQueue?: boolean;
}

export function useLeftBehindStatus(username: string | null) {
  const [status, setStatus] = useState<LeftBehindStatus>({
    isLeftBehind: false,
    isLoading: false,
    isMatched: false
  });

  const checkStatus = useCallback(async () => {
    if (!username) {
      setStatus({
        isLeftBehind: false,
        isLoading: false,
        isMatched: false
      });
      return;
    }
    
    try {
      setStatus(prev => ({ ...prev, isLoading: true }));
      
      const response = await fetch(`/api/check-left-behind-status?username=${encodeURIComponent(username)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to check left-behind status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'not_left_behind') {
        setStatus({
          isLeftBehind: false,
          isLoading: false,
          isMatched: false
        });
      } else if (data.status === 'already_matched') {
        setStatus({
          isLeftBehind: true,
          isLoading: false,
          isMatched: true,
          matchedWith: data.matchedWith,
          matchRoom: data.roomName,
          timestamp: data.timestamp
        });
      } else if (data.status === 'left_behind') {
        setStatus({
          isLeftBehind: true,
          isLoading: false,
          isMatched: false,
          newRoomName: data.newRoomName,
          previousRoom: data.previousRoom,
          disconnectedFrom: data.disconnectedFrom,
          timestamp: data.timestamp,
          inQueue: data.inQueue
        });
      }
    } catch (error) {
      console.error('Error checking left-behind status:', error);
      setStatus(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }, [username]);

  // Check when username changes
  useEffect(() => {
    checkStatus();
    
    // Set up polling if needed
    if (username) {
      const interval = setInterval(checkStatus, 2000); // Check every 2 seconds
      return () => clearInterval(interval);
    }
  }, [username, checkStatus]);

  return {
    ...status,
    refresh: checkStatus
  };
} 