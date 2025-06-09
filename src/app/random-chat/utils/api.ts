import { MatchData, SkipCallResponse } from "../types";

export const api = {
  async getLiveKitToken(roomName: string, participantName: string): Promise<string> {
    const response = await fetch("/api/livekit-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName, participantName }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get video token");
    }

    const { token } = await response.json();
    return token;
  },

  async enqueue(userId: string): Promise<{ matched: boolean; data?: MatchData }> {
    const response = await fetch("/api/simple-matching/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to start matching");
    }

    return data;
  },

  async checkMatch(userId: string): Promise<{ matched: boolean; data?: MatchData; inQueue: boolean }> {
    const response = await fetch("/api/simple-matching/check-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    return response.json();
  },

  async checkDisconnect(userId: string): Promise<{ shouldDisconnect: boolean }> {
    const response = await fetch("/api/simple-matching/check-disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    return response.json();
  },

  async skipCall(userId: string, sessionId: string): Promise<SkipCallResponse> {
    const response = await fetch("/api/simple-matching/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, sessionId }),
    });

    if (!response.ok) {
      throw new Error("Failed to skip call");
    }

    return response.json();
  },

  async endCall(userId: string, sessionId: string): Promise<void> {
    await fetch("/api/simple-matching/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, sessionId }),
    });
  },

  async sendHeartbeat(userId: string): Promise<void> {
    await fetch("/api/simple-matching/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
  },

  async cleanup(): Promise<void> {
    await fetch("/api/simple-matching/cleanup", { method: "POST" });
  },

  async forceCleanup(userId: string): Promise<{ allClean: boolean }> {
    const response = await fetch("/api/simple-matching/force-cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    return response.json();
  },

  async checkAlone(userId: string): Promise<{ isAlone: boolean; reason: string }> {
    const response = await fetch("/api/simple-matching/check-alone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    return response.json();
  },

  async kickAlone(userId: string, reason: string): Promise<{ requeued: boolean }> {
    const response = await fetch("/api/simple-matching/kick-alone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, reason }),
    });

    return response.json();
  }
}; 