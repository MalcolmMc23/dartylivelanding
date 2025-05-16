"use client";

import { useState, useCallback } from "react";

// Define a type for the debug data structure
interface DebugData {
  waitingQueueSize?: number;
  inCallQueueSize?: number;
  activeMatchesCount?: number;
  waitingQueue?: string[];
  inCallQueue?: string[];
  activeMatches?: Record<string, unknown>;
}

export function AdminDebugPanel() {
  const [apiKey, setApiKey] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/check-match", { method: "GET" });
      const data = await response.json();
      setDebugData(data);
    } catch (err) {
      setError("Error loading debug data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const togglePanel = useCallback(() => {
    setShowPanel(!showPanel);
    if (!showPanel) {
      refreshStatus();
    }
  }, [showPanel, refreshStatus]);

  const resetAllMatches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/reset-matching", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey }),
      });

      const data = await response.json();

      if (response.ok) {
        setDebugData(null);
        refreshStatus();
      } else {
        setError(data.error || "Reset failed");
      }
    } catch (err) {
      setError("Error resetting match data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [apiKey, refreshStatus]);

  if (!showPanel) {
    return (
      <button
        onClick={togglePanel}
        className="fixed bottom-2 right-2 bg-gray-800 text-gray-300 px-2 py-1 text-xs rounded opacity-30 hover:opacity-100"
      >
        Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 bg-gray-900 text-white p-4 rounded-tl-lg border border-gray-700 shadow-lg max-w-[500px] max-h-[80vh] overflow-auto z-50">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">Admin Debug Panel</h3>
        <button
          onClick={togglePanel}
          className="text-gray-400 hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Admin API Key"
            className="bg-gray-800 text-white px-2 py-1 rounded text-sm flex-1"
          />
          <button
            onClick={resetAllMatches}
            disabled={!apiKey || loading}
            className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 text-white px-2 py-1 rounded text-sm"
          >
            Reset Matches
          </button>
          <button
            onClick={refreshStatus}
            disabled={loading}
            className="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-white px-2 py-1 rounded text-sm"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 text-red-300 p-2 rounded text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-4">
            <div className="animate-spin h-6 w-6 border-2 border-gray-400 rounded-full border-t-white mx-auto"></div>
          </div>
        )}

        {debugData && (
          <div className="space-y-2">
            <div className="bg-gray-800 p-2 rounded">
              <div className="font-semibold mb-1 text-gray-300">
                Queue Stats:
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-gray-700 rounded p-2 text-center">
                  <div>Waiting</div>
                  <div className="font-mono">
                    {debugData.waitingQueueSize || 0}
                  </div>
                </div>
                <div className="bg-gray-700 rounded p-2 text-center">
                  <div>In-Call</div>
                  <div className="font-mono">
                    {debugData.inCallQueueSize || 0}
                  </div>
                </div>
                <div className="bg-gray-700 rounded p-2 text-center">
                  <div>Matches</div>
                  <div className="font-mono">
                    {debugData.activeMatchesCount || 0}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm">
              <div className="font-semibold mb-1 text-gray-300">
                Waiting Queue:
              </div>
              <pre className="bg-gray-800 p-2 rounded overflow-x-auto text-xs">
                {JSON.stringify(debugData.waitingQueue || [], null, 2)}
              </pre>
            </div>

            <div className="text-sm">
              <div className="font-semibold mb-1 text-gray-300">
                In-Call Queue:
              </div>
              <pre className="bg-gray-800 p-2 rounded overflow-x-auto text-xs">
                {JSON.stringify(debugData.inCallQueue || [], null, 2)}
              </pre>
            </div>

            <div className="text-sm">
              <div className="font-semibold mb-1 text-gray-300">
                Active Matches:
              </div>
              <pre className="bg-gray-800 p-2 rounded overflow-x-auto text-xs">
                {JSON.stringify(debugData.activeMatches || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        This panel is for admins only.
      </div>
    </div>
  );
}
