"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface QueueHealth {
  orphanedUsers: number;
  staleLocks: number;
  corruptedData: number;
  lastCleanup: string;
}

export function QueueHealthMonitor() {
  const [health, setHealth] = useState<QueueHealth | null>(null);
  const [isFixing, setIsFixing] = useState(false);

  const checkHealth = async () => {
    try {
      const response = await fetch("/api/queue-health");
      const data = await response.json();
      setHealth(data);
    } catch (error) {
      console.error("Error checking queue health:", error);
    }
  };

  const fixIssues = async () => {
    setIsFixing(true);
    try {
      await fetch("/api/queue-health", { method: "POST" });
      await checkHealth();
    } catch (error) {
      console.error("Error fixing queue issues:", error);
    } finally {
      setIsFixing(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  const hasIssues =
    health.orphanedUsers > 0 ||
    health.staleLocks > 0 ||
    health.corruptedData > 0;

  return (
    <Card className={`${hasIssues ? "border-red-500" : "border-green-500"}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Queue Health
          {hasIssues && (
            <Button
              onClick={fixIssues}
              disabled={isFixing}
              variant="destructive"
              size="sm"
            >
              {isFixing ? "Fixing..." : "Fix Issues"}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div
            className={`${
              health.orphanedUsers > 0 ? "text-red-600" : "text-green-600"
            }`}
          >
            Orphaned Users: {health.orphanedUsers}
          </div>
          <div
            className={`${
              health.staleLocks > 0 ? "text-red-600" : "text-green-600"
            }`}
          >
            Stale Locks: {health.staleLocks}
          </div>
          <div
            className={`${
              health.corruptedData > 0 ? "text-red-600" : "text-green-600"
            }`}
          >
            Corrupted Data: {health.corruptedData}
          </div>
          <div className="text-gray-500">
            Last Cleanup: {health.lastCleanup}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
