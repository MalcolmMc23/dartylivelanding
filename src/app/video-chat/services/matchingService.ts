import { MatchingAPIResponse } from "../components/types";

// Matching service for API calls
class MatchingService {
  private readonly baseUrl: string;

  constructor() {
    // Use relative URLs for API routes in the same Next.js app
    this.baseUrl = '';
  }

  // Enqueue user for matching
  async enqueue(userId: string): Promise<MatchingAPIResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/matching/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to enqueue user'
        };
      }
      
      return data;
    } catch (error) {
      console.error('Error enqueuing user:', error);
      return {
        success: false,
        error: 'Failed to enqueue user'
      };
    }
  }

  // Skip current session and look for new match
  async skip(sessionId: string, userId: string): Promise<MatchingAPIResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/matching/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userId })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to skip session'
        };
      }
      
      return data;
    } catch (error) {
      console.error('Error skipping session:', error);
      return {
        success: false,
        error: 'Failed to skip session'
      };
    }
  }

  // End current session
  async endSession(sessionId: string, userId: string): Promise<MatchingAPIResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/matching/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userId })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to end session'
        };
      }
      
      return data;
    } catch (error) {
      console.error('Error ending session:', error);
      return {
        success: false,
        error: 'Failed to end session'
      };
    }
  }

  // Get queue status
  async getQueueStatus(userId: string): Promise<{ position: number; estimatedWaitTime: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/matching/status?userId=${userId}`);
      
      if (!response.ok) {
        throw new Error('Failed to get queue status');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting queue status:', error);
      return {
        position: 1,
        estimatedWaitTime: 5000
      };
    }
  }
}

export const matchingService = new MatchingService(); 