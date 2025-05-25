"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// Badge component - using simple span instead
// import { Badge } from "@/components/ui/badge";

// Simple Badge component replacement
const Badge = ({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "destructive" | "secondary";
  className?: string;
}) => {
  const baseClasses =
    "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
  const variantClasses = {
    default: "bg-blue-100 text-blue-800",
    destructive: "bg-red-100 text-red-800",
    secondary: "bg-gray-100 text-gray-800",
  };

  return (
    <span className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
};

interface RoomSyncStatus {
  success: boolean;
  syncResult?: {
    usersAddedToQueue: number;
    usersRemovedFromQueue: number;
    roomsCleaned: number;
  };
  usersAloneInRooms?: string[];
  timestamp: string;
  message: string;
}

export function RoomStateSyncMonitor() {
  const [syncStatus, setSyncStatus] = useState<RoomSyncStatus | null>(null);
  const [isLoading, setSyncLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkRoomState = async () => {
    setSyncLoading(true);
    try {
      const response = await fetch("/api/sync-room-states");
      const data = await response.json();
      setSyncStatus(data);
    } catch (error) {
      console.error("Error checking room state:", error);
      setSyncStatus({
        success: false,
        message: "Error checking room state",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const triggerSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/sync-room-states", { method: "POST" });
      const data = await response.json();
      setSyncStatus(data);
    } catch (error) {
      console.error("Error triggering sync:", error);
      setSyncStatus({
        success: false,
        message: "Error triggering sync",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    checkRoomState();
    const interval = setInterval(checkRoomState, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (!syncStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Room State Sync</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const hasIssues =
    syncStatus.usersAloneInRooms && syncStatus.usersAloneInRooms.length > 0;
  const hasActivity =
    syncStatus.syncResult &&
    (syncStatus.syncResult.usersAddedToQueue > 0 ||
      syncStatus.syncResult.usersRemovedFromQueue > 0 ||
      syncStatus.syncResult.roomsCleaned > 0);

  return (
    <Card className={`${hasIssues ? "border-yellow-500" : "border-green-500"}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Room State Sync
          <div className="flex gap-2">
            <Button
              onClick={checkRoomState}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              {isLoading ? "Checking..." : "Check State"}
            </Button>
            <Button
              onClick={triggerSync}
              disabled={isSyncing}
              variant={hasIssues ? "default" : "outline"}
              size="sm"
            >
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <Badge variant={syncStatus.success ? "default" : "destructive"}>
              {syncStatus.success ? "Success" : "Error"}
            </Badge>
            <span className="text-sm text-gray-500">
              {new Date(syncStatus.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {/* Users Alone in Rooms */}
          {syncStatus.usersAloneInRooms && (
            <div>
              <h4 className="font-medium text-sm mb-2">
                Users Alone in Rooms ({syncStatus.usersAloneInRooms.length})
              </h4>
              {syncStatus.usersAloneInRooms.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {syncStatus.usersAloneInRooms.map((username) => (
                    <Badge
                      key={username}
                      variant="secondary"
                      className="text-xs"
                    >
                      {username}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-green-600">
                  No users alone in rooms
                </p>
              )}
            </div>
          )}

          {/* Sync Results */}
          {syncStatus.syncResult && (
            <div>
              <h4 className="font-medium text-sm mb-2">Last Sync Results</h4>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div
                  className={`p-2 rounded ${
                    syncStatus.syncResult.usersAddedToQueue > 0
                      ? "bg-blue-50"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="font-medium">
                    {syncStatus.syncResult.usersAddedToQueue}
                  </div>
                  <div className="text-xs text-gray-600">Added to Queue</div>
                </div>
                <div
                  className={`p-2 rounded ${
                    syncStatus.syncResult.usersRemovedFromQueue > 0
                      ? "bg-orange-50"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="font-medium">
                    {syncStatus.syncResult.usersRemovedFromQueue}
                  </div>
                  <div className="text-xs text-gray-600">
                    Removed from Queue
                  </div>
                </div>
                <div
                  className={`p-2 rounded ${
                    syncStatus.syncResult.roomsCleaned > 0
                      ? "bg-red-50"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="font-medium">
                    {syncStatus.syncResult.roomsCleaned}
                  </div>
                  <div className="text-xs text-gray-600">Rooms Cleaned</div>
                </div>
              </div>
            </div>
          )}

          {/* Activity Indicator */}
          {hasActivity && (
            <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
              <p className="text-sm text-yellow-800">
                ⚠️ Recent sync activity detected - system is actively fixing
                inconsistencies
              </p>
            </div>
          )}

          {/* Message */}
          <p className="text-sm text-gray-600">{syncStatus.message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
