"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface MatchUser {
  username: string;
  waitingFor: string;
  timestamp: string;
}

interface MatchRoom {
  roomName: string;
  users: string[];
  userCount: number;
}

interface MatchDataResponse {
  waitingUsers: MatchUser[];
  waitingCount: number;
  activeMatches: MatchRoom[];
  activeMatchCount: number;
  serverTime: string;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
}

export default function MatchDebugPage() {
  const [matchData, setMatchData] = useState<MatchDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [resetKey, setResetKey] = useState("");
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const router = useRouter();

  // Function to fetch the current matching system state
  const fetchMatchData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/debug-match");

      if (!response.ok) {
        throw new Error(
          `Failed to fetch match data: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as MatchDataResponse;
      setMatchData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Function to reset the matching system
  const resetMatchSystem = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/reset-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ adminKey: resetKey }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResetStatus(`Error: ${data.error || response.statusText}`);
      } else {
        setResetStatus(
          `Success: ${data.message}. Cleared ${data.clearedData.waitingUsers} waiting users and ${data.clearedData.activeMatches} active matches.`
        );
        // Refresh data
        fetchMatchData();
      }
    } catch (err) {
      setResetStatus(
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setLoading(false);
    }
  };

  // Set up auto-refresh
  useEffect(() => {
    fetchMatchData();

    const intervalId = setInterval(() => {
      fetchMatchData();
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Match System Debug</h1>

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">System Status</h2>
            <div className="flex items-center gap-2">
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="border rounded p-1 text-sm"
              >
                <option value={2000}>Refresh: 2s</option>
                <option value={5000}>Refresh: 5s</option>
                <option value={10000}>Refresh: 10s</option>
                <option value={30000}>Refresh: 30s</option>
              </select>
              <button
                onClick={fetchMatchData}
                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                disabled={loading}
              >
                {loading ? "Loading..." : "Refresh Now"}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              Error: {error}
            </div>
          )}

          {matchData && (
            <div className="text-sm">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 p-3 rounded">
                  <p className="font-medium">
                    Waiting Users: {matchData.waitingCount}
                  </p>
                  <p className="text-gray-500">Users in matching queue</p>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <p className="font-medium">
                    Active Matches: {matchData.activeMatchCount}
                  </p>
                  <p className="text-gray-500">Ongoing conversations</p>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Server Time: {matchData.serverTime}
              </p>
            </div>
          )}
        </div>

        {/* Waiting Users Section */}
        {matchData &&
          matchData.waitingUsers &&
          matchData.waitingUsers.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h2 className="text-xl font-semibold mb-3">
                Waiting Users ({matchData.waitingUsers.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="py-2 px-3 text-left">Username</th>
                      <th className="py-2 px-3 text-left">Waiting For</th>
                      <th className="py-2 px-3 text-left">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchData.waitingUsers.map((user, index) => (
                      <tr key={index} className="border-t">
                        <td className="py-2 px-3">{user.username}</td>
                        <td className="py-2 px-3">{user.waitingFor}</td>
                        <td className="py-2 px-3">{user.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        {/* Active Matches Section */}
        {matchData &&
          matchData.activeMatches &&
          matchData.activeMatches.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h2 className="text-xl font-semibold mb-3">
                Active Matches ({matchData.activeMatches.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="py-2 px-3 text-left">Room</th>
                      <th className="py-2 px-3 text-left">Users</th>
                      <th className="py-2 px-3 text-left">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchData.activeMatches.map((match, index) => (
                      <tr key={index} className="border-t">
                        <td className="py-2 px-3 font-mono text-xs">
                          {match.roomName}
                        </td>
                        <td className="py-2 px-3">{match.users.join(", ")}</td>
                        <td className="py-2 px-3">{match.userCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        {/* Reset System Section */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="text-xl font-semibold mb-3">Reset Match System</h2>
          <p className="text-sm text-gray-600 mb-4">
            Use this with caution! This will clear all waiting users and active
            matches.
          </p>

          {resetStatus && (
            <div
              className={`mb-4 px-4 py-3 rounded text-sm ${
                resetStatus.startsWith("Success")
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {resetStatus}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Reset Key"
              value={resetKey}
              onChange={(e) => setResetKey(e.target.value)}
              className="flex-1 border rounded p-2 text-sm"
            />
            <button
              onClick={resetMatchSystem}
              className="bg-red-500 text-white px-4 py-2 rounded text-sm hover:bg-red-600"
              disabled={loading || !resetKey}
            >
              Reset System
            </button>
          </div>
        </div>

        {/* Back Button */}
        <button
          onClick={() => router.push("/")}
          className="bg-gray-500 text-white px-4 py-2 rounded text-sm hover:bg-gray-600"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
