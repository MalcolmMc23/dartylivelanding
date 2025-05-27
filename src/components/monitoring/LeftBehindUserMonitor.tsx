"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, CheckCircle, Clock } from "lucide-react";

interface LeftBehindState {
  username: string;
  previousRoom: string;
  disconnectedFrom: string;
  timestamp: number;
  processed: boolean;
  newRoomName?: string;
}

interface ConsistencyCheckResult {
  timestamp: number;
  checksPerformed: string[];
  issues: string[];
  fixes: string[];
  stats: {
    usersInQueue: number;
    activeMatches: number;
    leftBehindStatesCleanedUp: number;
    duplicateQueueEntriesRemoved: number;
    orphanedMatchesRemoved: number;
  };
}

export function LeftBehindUserMonitor() {
  const [leftBehindUsers, setLeftBehindUsers] = useState<LeftBehindState[]>([]);
  const [consistencyResult, setConsistencyResult] =
    useState<ConsistencyCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLeftBehindStates = async () => {
    try {
      const response = await fetch("/api/monitoring/left-behind-states");
      if (response.ok) {
        const data = await response.json();
        setLeftBehindUsers(data.states || []);
      }
    } catch (error) {
      console.error("Error fetching left-behind states:", error);
    }
  };

  const fetchConsistencyCheck = async () => {
    try {
      const response = await fetch("/api/monitoring/consistency-check");
      if (response.ok) {
        const data = await response.json();
        setConsistencyResult(data);
      }
    } catch (error) {
      console.error("Error fetching consistency check:", error);
    }
  };

  const runManualConsistencyCheck = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/monitoring/consistency-check", {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        setConsistencyResult(data);
      }
    } catch (error) {
      console.error("Error running consistency check:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeftBehindStates();
    fetchConsistencyCheck();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchLeftBehindStates();
        fetchConsistencyCheck();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getTimeSince = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">System Monitoring</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto-refresh: {autoRefresh ? "ON" : "OFF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={runManualConsistencyCheck}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Run Check
          </Button>
        </div>
      </div>

      {/* Left Behind Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Left Behind Users ({leftBehindUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leftBehindUsers.length === 0 ? (
            <p className="text-muted-foreground">
              No left-behind users currently
            </p>
          ) : (
            <div className="space-y-2">
              {leftBehindUsers.map((user, index) => (
                <div key={index} className="border rounded p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{user.username}</span>
                    <Badge variant={user.processed ? "default" : "secondary"}>
                      {user.processed ? "Processed" : "Pending"}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Previous room: {user.previousRoom}</p>
                    <p>Disconnected from: {user.disconnectedFrom}</p>
                    <p>Time: {getTimeSince(user.timestamp)}</p>
                    {user.newRoomName && <p>New room: {user.newRoomName}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consistency Check Results */}
      {consistencyResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {consistencyResult.issues.length > 0 ? (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
              Consistency Check Results
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Last run: {formatTimestamp(consistencyResult.timestamp)}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div className="border rounded p-2">
                <p className="text-sm text-muted-foreground">Users in Queue</p>
                <p className="text-lg font-semibold">
                  {consistencyResult.stats.usersInQueue}
                </p>
              </div>
              <div className="border rounded p-2">
                <p className="text-sm text-muted-foreground">Active Matches</p>
                <p className="text-lg font-semibold">
                  {consistencyResult.stats.activeMatches}
                </p>
              </div>
              <div className="border rounded p-2">
                <p className="text-sm text-muted-foreground">States Cleaned</p>
                <p className="text-lg font-semibold">
                  {consistencyResult.stats.leftBehindStatesCleanedUp}
                </p>
              </div>
              <div className="border rounded p-2">
                <p className="text-sm text-muted-foreground">
                  Duplicates Removed
                </p>
                <p className="text-lg font-semibold">
                  {consistencyResult.stats.duplicateQueueEntriesRemoved}
                </p>
              </div>
              <div className="border rounded p-2">
                <p className="text-sm text-muted-foreground">
                  Orphaned Matches
                </p>
                <p className="text-lg font-semibold">
                  {consistencyResult.stats.orphanedMatchesRemoved}
                </p>
              </div>
            </div>

            {/* Issues */}
            {consistencyResult.issues.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  Issues Found
                </h4>
                <ul className="list-disc list-inside space-y-1">
                  {consistencyResult.issues.map((issue, index) => (
                    <li key={index} className="text-sm text-muted-foreground">
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fixes Applied */}
            {consistencyResult.fixes.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Fixes Applied
                </h4>
                <ul className="list-disc list-inside space-y-1">
                  {consistencyResult.fixes.map((fix, index) => (
                    <li key={index} className="text-sm text-muted-foreground">
                      {fix}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
