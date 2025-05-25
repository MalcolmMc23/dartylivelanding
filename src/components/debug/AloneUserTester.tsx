"use client";

import { useState } from "react";

interface AloneUserDebugInfo {
  timestamp: string;
  aloneUsers: Array<{
    username: string;
    roomName: string;
    timeAlone: number;
    shouldReset: boolean;
  }>;
  summary: {
    totalAloneUsers: number;
    usersReadyForReset: number;
    aloneUsersDetails: Array<{
      username: string;
      timeAlone: number;
      shouldReset: boolean;
    }>;
  };
}

export function AloneUserTester() {
  const [debugInfo, setDebugInfo] = useState<AloneUserDebugInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDebugInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/debug-alone-users");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setDebugInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const processAloneUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/process-alone-users", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("Process alone users result:", data);

      // Refresh debug info after processing
      await fetchDebugInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-100 rounded-lg">
      <h2 className="text-xl font-bold mb-4">Alone User Debug Tool</h2>

      <div className="flex gap-4 mb-6">
        <button
          onClick={fetchDebugInfo}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Fetch Debug Info"}
        </button>

        <button
          onClick={processAloneUsers}
          disabled={loading}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? "Processing..." : "Process Alone Users"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      {debugInfo && (
        <div className="space-y-4">
          <div className="p-4 bg-white rounded border">
            <h3 className="font-semibold mb-2">Summary</h3>
            <p>Total alone users: {debugInfo.summary.totalAloneUsers}</p>
            <p>Users ready for reset: {debugInfo.summary.usersReadyForReset}</p>
            <p>
              Last updated: {new Date(debugInfo.timestamp).toLocaleString()}
            </p>
          </div>

          {debugInfo.aloneUsers.length > 0 && (
            <div className="p-4 bg-white rounded border">
              <h3 className="font-semibold mb-2">Alone Users</h3>
              <div className="space-y-2">
                {debugInfo.aloneUsers.map((user, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded ${
                      user.shouldReset
                        ? "bg-red-50 border border-red-200"
                        : "bg-yellow-50 border border-yellow-200"
                    }`}
                  >
                    <div className="font-medium">{user.username}</div>
                    <div className="text-sm text-gray-600">
                      Room: {user.roomName} | Time alone:{" "}
                      {Math.round(user.timeAlone / 1000)}s |
                      {user.shouldReset ? " ⚠️ Ready for reset" : " ⏳ Waiting"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {debugInfo.aloneUsers.length === 0 && (
            <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded">
              No users are currently alone in rooms.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
