"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SystemStats {
  queueSize: number;
  activeMatchesCount: number;
  cooldownCount: number;
  leftBehindCount: number;
  aloneUserCount: number;
}

interface ResetResult {
  success: boolean;
  action: string;
  clearedItems: number;
  results: string[];
  message: string;
}

export function SystemResetDebugger() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ResetResult | null>(null);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/debug/reset-system");
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetSystem = async (action: string) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/debug/reset-system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        const result = await response.json();
        setLastResult(result);
        // Refresh stats after reset
        await fetchStats();
      }
    } catch (error) {
      console.error("Error resetting system:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-lg">System Reset Debugger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={fetchStats}
            disabled={isLoading}
            size="sm"
            variant="outline"
          >
            {isLoading ? "Loading..." : "Refresh Stats"}
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 p-3 rounded">
              <div className="font-medium">Queue Size</div>
              <div className="text-2xl font-bold text-blue-600">
                {stats.queueSize}
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="font-medium">Active Matches</div>
              <div className="text-2xl font-bold text-green-600">
                {stats.activeMatchesCount}
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="font-medium">Cooldowns</div>
              <div className="text-2xl font-bold text-orange-600">
                {stats.cooldownCount}
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="font-medium">Left Behind</div>
              <div className="text-2xl font-bold text-red-600">
                {stats.leftBehindCount}
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="font-medium">Alone Users</div>
              <div className="text-2xl font-bold text-purple-600">
                {stats.aloneUserCount}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-medium">Reset Actions:</h4>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => resetSystem("cooldowns")}
              disabled={isLoading}
              size="sm"
              variant="outline"
            >
              Clear Cooldowns
            </Button>
            <Button
              onClick={() => resetSystem("queue")}
              disabled={isLoading}
              size="sm"
              variant="outline"
            >
              Clear Queue
            </Button>
            <Button
              onClick={() => resetSystem("matches")}
              disabled={isLoading}
              size="sm"
              variant="outline"
            >
              Clear Matches
            </Button>
            <Button
              onClick={() => resetSystem("left-behind")}
              disabled={isLoading}
              size="sm"
              variant="outline"
            >
              Clear Left Behind
            </Button>
            <Button
              onClick={() => resetSystem("alone-users")}
              disabled={isLoading}
              size="sm"
              variant="outline"
            >
              Clear Alone Users
            </Button>
            <Button
              onClick={() => resetSystem("full")}
              disabled={isLoading}
              size="sm"
              variant="destructive"
            >
              Full Reset
            </Button>
          </div>
        </div>

        {lastResult && (
          <div
            className={`p-3 rounded text-sm ${
              lastResult.success
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <div className="font-medium">
              {lastResult.success ? "✅" : "❌"} {lastResult.message}
            </div>
            <div className="text-xs mt-1">
              Cleared {lastResult.clearedItems} items
            </div>
            {lastResult.results.length > 0 && (
              <ul className="text-xs mt-2 space-y-1">
                {lastResult.results.map((result, index) => (
                  <li key={index}>• {result}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
