"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface HealthStatus {
  redis: boolean;
  queueProcessor: boolean;
  lockStatus: string;
  queueCount: number;
  activeMatches: number;
  errors: string[];
  recommendations: string[];
  timestamp?: string;
}

interface DetailedStatus extends HealthStatus {
  queueDetails: Array<{
    username: string;
    state: string;
    ageSeconds: number;
    useDemo?: boolean;
  }>;
  environment: string;
}

export default function ProductionDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [detailed, setDetailed] = useState<DetailedStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchHealth = async (isDetailed = false) => {
    setLoading(true);
    try {
      const url = isDetailed
        ? "/api/production-health?action=status&detailed=true"
        : "/api/production-health?action=status";

      const response = await fetch(url);
      const data = await response.json();

      if (isDetailed) {
        setDetailed(data);
      } else {
        setHealth(data);
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to fetch health status:", error);
    }
    setLoading(false);
  };

  const performAction = async (action: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/production-health?action=${action}`);
      const result = await response.json();

      console.log(`Action ${action} result:`, result);

      // Refresh status after action
      await fetchHealth();

      return result;
    } catch (error) {
      console.error(`Failed to perform action ${action}:`, error);
    }
    setLoading(false);
  };

  const emergencyRestart = async () => {
    if (
      !confirm(
        "Are you sure you want to perform an emergency restart of the matching system?"
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/production-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "emergency-restart" }),
      });
      const result = await response.json();

      console.log("Emergency restart result:", result);

      // Wait a moment then refresh
      setTimeout(() => fetchHealth(), 2000);
    } catch (error) {
      console.error("Emergency restart failed:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
    }
  }, [isOpen]);

  const getStatusColor = (status: boolean) =>
    status ? "text-green-600" : "text-red-600";
  const getStatusIcon = (status: boolean) => (status ? "✅" : "❌");

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          variant="outline"
          size="sm"
          className="bg-gray-800 text-white border-gray-600 hover:bg-gray-700"
        >
          🔧 Debug
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white border rounded-lg shadow-lg w-96 max-h-[70vh] overflow-auto">
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Production Debug Panel</h3>
          <Button onClick={() => setIsOpen(false)} variant="ghost" size="sm">
            ✕
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="mb-4 space-y-2">
          <div className="flex gap-2">
            <Button
              onClick={() => fetchHealth()}
              disabled={loading}
              size="sm"
              variant="outline"
            >
              {loading ? "⏳" : "🔄"} Refresh
            </Button>
            <Button
              onClick={() => performAction("repair")}
              disabled={loading}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              🔧 Auto-Repair
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => fetchHealth(true)}
              disabled={loading}
              size="sm"
              variant="outline"
            >
              📊 Detailed
            </Button>
            <Button
              onClick={emergencyRestart}
              disabled={loading}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              🚨 Emergency Restart
            </Button>
          </div>
        </div>

        {/* Health Status */}
        {health && (
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <h4 className="font-medium mb-2">System Health</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Redis:</span>
                <span className={getStatusColor(health.redis)}>
                  {getStatusIcon(health.redis)}{" "}
                  {health.redis ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Queue Processor:</span>
                <span className={getStatusColor(health.queueProcessor)}>
                  {getStatusIcon(health.queueProcessor)}{" "}
                  {health.queueProcessor ? "Running" : "Stopped"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Lock Status:</span>
                <span className="text-gray-700">{health.lockStatus}</span>
              </div>
              <div className="flex justify-between">
                <span>Queue Count:</span>
                <span className="text-gray-700">{health.queueCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Active Matches:</span>
                <span className="text-gray-700">{health.activeMatches}</span>
              </div>
            </div>
          </div>
        )}

        {/* Errors and Recommendations */}
        {health?.errors && health.errors.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 rounded">
            <h4 className="font-medium text-red-800 mb-2">Errors</h4>
            <ul className="text-sm text-red-700 space-y-1">
              {health.errors.map((error, i) => (
                <li key={i}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {health?.recommendations && health.recommendations.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 rounded">
            <h4 className="font-medium text-yellow-800 mb-2">
              Recommendations
            </h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              {health.recommendations.map((rec, i) => (
                <li key={i}>• {rec}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Queue Info */}
        {detailed?.queueDetails && (
          <div className="mb-4 p-3 bg-blue-50 rounded">
            <h4 className="font-medium text-blue-800 mb-2">Queue Details</h4>
            <div className="max-h-32 overflow-auto">
              {detailed.queueDetails.map((user, i) => (
                <div
                  key={i}
                  className="text-sm text-blue-700 flex justify-between"
                >
                  <span>{user.username}</span>
                  <span>
                    {user.state} ({user.ageSeconds}s)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Update */}
        {lastUpdate && (
          <div className="text-xs text-gray-500 text-center">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
