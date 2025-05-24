"use client";

import { useState, useEffect } from "react";

interface QueueProcessorStatusProps {
  showControls?: boolean;
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

export function QueueProcessorStatus({
  showControls = false,
}: QueueProcessorStatusProps) {
  const [status, setStatus] = useState<ProcessorStatus | null>(null);
  const [lastResult, setLastResult] = useState<ProcessingResult | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check processor status
  const checkStatus = async () => {
    try {
      const response = await fetch("/api/trigger-queue-processing");
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (error) {
      setError(`Failed to check status: ${error}`);
    }
  };

  // Manually trigger queue processing
  const triggerProcessing = async () => {
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
        setLastResult(data.result);
        setError(null);
      } else {
        setError(data.error || "Unknown error");
      }
    } catch (error) {
      setError(`Failed to trigger processing: ${error}`);
    } finally {
      setIsTriggering(false);
    }
  };

  // Auto-refresh status every 10 seconds
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!showControls && !status?.isRunning) {
    return null; // Don't show anything if processor is not running and controls are hidden
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-4 rounded-lg text-xs max-w-xs z-50">
      <div className="mb-2">
        <h4 className="font-bold mb-1">Queue Processor</h4>
        {status && (
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                status.isRunning ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span>{status.isRunning ? "Running" : "Stopped"}</span>
          </div>
        )}
      </div>

      {lastResult && (
        <div className="mb-2 p-2 bg-gray-800 rounded">
          <div>Matches: {lastResult.matchesCreated}</div>
          <div>Users: {lastResult.usersProcessed}</div>
          {lastResult.errors.length > 0 && (
            <div className="text-red-400">
              Errors: {lastResult.errors.length}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-2 p-2 bg-red-900 rounded text-red-200 text-xs">
          {error}
        </div>
      )}

      {showControls && (
        <div className="flex gap-2">
          <button
            onClick={triggerProcessing}
            disabled={isTriggering}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-xs"
          >
            {isTriggering ? "Processing..." : "Trigger"}
          </button>
          <button
            onClick={checkStatus}
            className="px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded text-xs"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
