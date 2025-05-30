import { useState, useCallback } from "react";
import { matchingService } from "../services/matchingService";
import { MatchSession } from "../components/types";

export interface UseMatchingAPIReturn {
  // State
  isLoading: boolean;
  error: string | null;
  currentSession: MatchSession | null;
  
  // Actions
  requestMatch: (userId: string) => Promise<MatchSession | null>;
  skipMatch: (sessionId: string, userId: string) => Promise<MatchSession | null>;
  endMatch: (sessionId: string, userId: string) => Promise<void>;
  clearSession: () => void;
  clearError: () => void;
}

export function useMatchingAPI(): UseMatchingAPIReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<MatchSession | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearSession = useCallback(() => {
    setCurrentSession(null);
  }, []);

  // Request a new match
  const requestMatch = useCallback(async (userId: string): Promise<MatchSession | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await matchingService.enqueue(userId);
      
      if (response.success && response.data) {
        setCurrentSession(response.data);
        return response.data;
      } else {
        setError(response.error || "Failed to find a match");
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Network error occurred";
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Skip current match and look for new one
  const skipMatch = useCallback(async (sessionId: string, userId: string): Promise<MatchSession | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await matchingService.skip(sessionId, userId);
      
      if (response.success && response.data) {
        setCurrentSession(response.data);
        return response.data;
      } else {
        setError(response.error || "Failed to skip match");
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Network error occurred";
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // End current match
  const endMatch = useCallback(async (sessionId: string, userId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await matchingService.endSession(sessionId, userId);
      
      if (!response.success) {
        setError(response.error || "Failed to end match");
      }
      
      // Clear session regardless of response to prevent stuck states
      setCurrentSession(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Network error occurred";
      setError(errorMessage);
      // Still clear session to prevent stuck states
      setCurrentSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    currentSession,
    requestMatch,
    skipMatch,
    endMatch,
    clearSession,
    clearError,
  };
} 