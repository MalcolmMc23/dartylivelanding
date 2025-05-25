"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SyncStatus {
  syncServiceRunning: boolean;
  timestamp: string;
}

interface SyncResult {
  synced: number;
  errors: number;
  cleaned: number;
}

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/sync-rooms");
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Error fetching sync status:", error);
    }
  };

  const triggerAction = async (action: string) => {
    setLoading(true);
    try {
      const response = await fetch("/api/sync-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();

      if (data.result) {
        setLastSync(data.result);
      }

      // Refresh status after action
      await fetchStatus();
    } catch (error) {
      console.error(`Error triggering ${action}:`, error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!status) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="p-4">
          <div className="text-center text-gray-500">
            Loading sync status...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">LiveKit-Redis Sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span>Sync Service:</span>
          <span
            className={`px-2 py-1 rounded text-sm ${
              status.syncServiceRunning
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {status.syncServiceRunning ? "Running" : "Stopped"}
          </span>
        </div>

        {lastSync && (
          <div className="text-sm text-gray-600">
            <div>
              Last sync: {lastSync.synced} synced, {lastSync.cleaned} cleaned,{" "}
              {lastSync.errors} errors
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerAction("sync")}
            disabled={loading}
          >
            Sync Now
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerAction("cleanup")}
            disabled={loading}
          >
            Cleanup
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              triggerAction(
                status.syncServiceRunning ? "stop-service" : "start-service"
              )
            }
            disabled={loading}
          >
            {status.syncServiceRunning ? "Stop" : "Start"} Service
          </Button>
        </div>

        <div className="text-xs text-gray-500">
          Last updated: {new Date(status.timestamp).toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
}
