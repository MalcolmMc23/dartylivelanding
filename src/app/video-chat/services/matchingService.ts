import { MatchingAPIResponse } from "../components/types";

// Mock matching service - replace with actual API calls when backend is ready
class MatchingService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_MATCHING_SERVICE_URL || 'http://localhost:3001';
  }

  // Enqueue user for matching
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async enqueue(_userId: string): Promise<MatchingAPIResponse> {
    try {
      // Mock implementation - replace with actual API call
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            data: {
              sessionId: `session_${Date.now()}`,
              roomName: `room_${Date.now()}`,
              accessToken: `token_${Date.now()}`,
              peerId: `peer_${Math.random().toString(36).substr(2, 9)}`,
            }
          });
        }, 2000 + Math.random() * 3000);
      });

      // Actual implementation would be:
      // const response = await fetch(`${this.baseUrl}/api/enqueue`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ userId })
      // });
      // return await response.json();
    } catch (error) {
      console.error('Error enqueuing user:', error);
      return {
        success: false,
        error: 'Failed to enqueue user'
      };
    }
  }

  // Skip current session and look for new match
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async skip(_sessionId: string, _userId: string): Promise<MatchingAPIResponse> {
    try {
      // Mock implementation
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            data: {
              sessionId: `session_${Date.now()}`,
              roomName: `room_${Date.now()}`,
              accessToken: `token_${Date.now()}`,
              peerId: `peer_${Math.random().toString(36).substr(2, 9)}`,
            }
          });
        }, 1000 + Math.random() * 2000);
      });

      // Actual implementation would be:
      // const response = await fetch(`${this.baseUrl}/api/skip`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ sessionId, userId })
      // });
      // return await response.json();
    } catch (error) {
      console.error('Error skipping session:', error);
      return {
        success: false,
        error: 'Failed to skip session'
      };
    }
  }

  // End current session
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async endSession(_sessionId: string, _userId: string): Promise<MatchingAPIResponse> {
    try {
      // Mock implementation
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true
          });
        }, 500);
      });

      // Actual implementation would be:
      // const response = await fetch(`${this.baseUrl}/api/end`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ sessionId, userId })
      // });
      // return await response.json();
    } catch (error) {
      console.error('Error ending session:', error);
      return {
        success: false,
        error: 'Failed to end session'
      };
    }
  }

  // Get queue status
  async getQueueStatus(): Promise<{ position: number; estimatedWaitTime: number }> {
    try {
      // Mock implementation
      return {
        position: Math.floor(Math.random() * 50) + 1,
        estimatedWaitTime: Math.floor(Math.random() * 30000) + 5000 // 5-35 seconds
      };

      // Actual implementation would be:
      // const response = await fetch(`${this.baseUrl}/api/queue/status`);
      // return await response.json();
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