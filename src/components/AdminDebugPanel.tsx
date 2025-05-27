"use client";

import { useState, useCallback, useEffect } from "react";

// Define a type for the debug data structure
interface DebugData {
  matchingQueueSize?: number;
  activeMatchesCount?: number;
  matchingQueue?: string[];
  activeMatches?: Record<string, unknown>;
}

interface ProcessorStatus {
  isRunning: boolean;
  message: string;
  timestamp: number;
}

interface ProcessingResult {
  matchesCreated: number;
  usersProcessed: number;
  errors: string[];
}

export function AdminDebugPanel() {
  const [apiKey, setApiKey] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Queue processor state
  const [processorStatus, setProcessorStatus] =
    useState<ProcessorStatus | null>(null);
  const [lastProcessingResult, setLastProcessingResult] =
    useState<ProcessingResult | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

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

  const checkProcessorStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/trigger-queue-processing");
      const data = await response.json();
      setProcessorStatus(data);
    } catch (error) {
      console.error("Failed to check processor status:", error);
    }
  }, []);

  const triggerQueueProcessing = useCallback(async () => {
    if (isTriggering) return;

    setIsTriggering(true);
    try {
      const response = await fetch("/api/trigger-queue-processing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.success) {
        setLastProcessingResult(data.result);
        setError(null);
      } else {
        setError(data.error || "Unknown error");
      }
    } catch (error) {
      setError(`Failed to trigger processing: ${error}`);
    } finally {
      setIsTriggering(false);
    }
  }, [isTriggering]);

  const togglePanel = useCallback(() => {
    setShowPanel(!showPanel);
    if (!showPanel) {
      refreshStatus();
      checkProcessorStatus();
    }
  }, [showPanel, refreshStatus, checkProcessorStatus]);

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

  // Auto-refresh processor status when panel is open
  useEffect(() => {
    if (showPanel) {
      checkProcessorStatus();
      const interval = setInterval(checkProcessorStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [showPanel, checkProcessorStatus]);

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
        {/* Queue Processor Status */}
        <div className="bg-gray-800 p-3 rounded">
          <div className="font-semibold mb-2 text-gray-300">
            Queue Processor
          </div>
          {processorStatus && (
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    processorStatus.isRunning ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="text-sm">
                  {processorStatus.isRunning ? "Running" : "Stopped"}
                </span>
              </div>
              <button
                onClick={triggerQueueProcessing}
                disabled={isTriggering}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
              >
                {isTriggering ? "Processing..." : "Trigger"}
              </button>
            </div>
          )}

          {lastProcessingResult && (
            <div className="text-xs bg-gray-700 p-2 rounded">
              <div>
                Last Processing: {lastProcessingResult.matchesCreated} matches
                created
              </div>
              <div>Users processed: {lastProcessingResult.usersProcessed}</div>
              {lastProcessingResult.errors.length > 0 && (
                <div className="text-red-400">
                  Errors: {lastProcessingResult.errors.length}
                </div>
              )}
            </div>
          )}
        </div>

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
                  <div>Queue Size</div>
                  <div className="font-mono">
                    {debugData.matchingQueueSize || 0}
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
              <div className="font-semibold mb-1 text-gray-300">Queue:</div>
              <pre className="bg-gray-800 p-2 rounded overflow-x-auto text-xs">
                {JSON.stringify(debugData.matchingQueue || [], null, 2)}
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
