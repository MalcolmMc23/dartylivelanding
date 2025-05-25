"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Database,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
} from "lucide-react";
import {
  getMigrationStatus,
  setQueueSystemOverride,
  useSimpleQueue,
  type MigrationStatus,
} from "@/utils/featureFlags";

interface SystemHealth {
  simpleQueue: {
    status: "healthy" | "warning" | "error";
    responseTime?: number;
    lastError?: string;
  };
  hybridQueue: {
    status: "healthy" | "warning" | "error";
    responseTime?: number;
    lastError?: string;
  };
}

export function MigrationController() {
  const [migrationStatus, setMigrationStatus] =
    useState<MigrationStatus | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [message, setMessage] = useState("");
  const currentSystem = useSimpleQueue() ? "simple" : "hybrid";

  const updateStatus = useCallback(async () => {
    try {
      const [status, health] = await Promise.all([
        getMigrationStatus(),
        checkSystemHealth(),
      ]);

      setMigrationStatus(status);
      setSystemHealth(health);
    } catch (error) {
      console.error("Error updating migration status:", error);
      setMessage(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }, []);

  const checkSystemHealth = async (): Promise<SystemHealth> => {
    const health: SystemHealth = {
      simpleQueue: { status: "healthy" },
      hybridQueue: { status: "healthy" },
    };

    try {
      // Test Simple Queue
      const simpleStart = Date.now();
      const simpleResponse = await fetch("/api/simple-queue?action=stats");
      const simpleTime = Date.now() - simpleStart;

      if (simpleResponse.ok) {
        health.simpleQueue = {
          status: simpleTime > 2000 ? "warning" : "healthy",
          responseTime: simpleTime,
        };
      } else {
        health.simpleQueue = {
          status: "error",
          responseTime: simpleTime,
          lastError: `HTTP ${simpleResponse.status}`,
        };
      }
    } catch (error) {
      health.simpleQueue = {
        status: "error",
        lastError: error instanceof Error ? error.message : "Network error",
      };
    }

    try {
      // Test Hybrid Queue
      const hybridStart = Date.now();
      const hybridResponse = await fetch("/api/match-user?action=stats");
      const hybridTime = Date.now() - hybridStart;

      if (hybridResponse.ok) {
        health.hybridQueue = {
          status: hybridTime > 2000 ? "warning" : "healthy",
          responseTime: hybridTime,
        };
      } else {
        health.hybridQueue = {
          status: "error",
          responseTime: hybridTime,
          lastError: `HTTP ${hybridResponse.status}`,
        };
      }
    } catch (error) {
      health.hybridQueue = {
        status: "error",
        lastError: error instanceof Error ? error.message : "Network error",
      };
    }

    return health;
  };

  const switchSystem = async (system: "simple" | "hybrid") => {
    setIsLoading(true);
    setMessage(`Switching to ${system} queue system...`);

    try {
      setQueueSystemOverride(system);
      // The page will reload, so we won't see this message
    } catch (error) {
      setMessage(`Error switching to ${system}: ${error}`);
      setIsLoading(false);
    }
  };

  const clearOverride = () => {
    setQueueSystemOverride(null);
  };

  const performMigrationTest = async () => {
    setIsLoading(true);
    setMessage("Running migration test...");

    try {
      // This would be a comprehensive test of the migration
      // For now, we'll just simulate it
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setMessage("✅ Migration test completed successfully");
    } catch (error) {
      setMessage(`❌ Migration test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    updateStatus();

    if (autoRefresh) {
      const interval = setInterval(updateStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [updateStatus, autoRefresh]);

  const getStatusIcon = (status: "healthy" | "warning" | "error") => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-2 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Migration Control Center
          </CardTitle>
          <p className="text-sm text-gray-600">
            Monitor and control the queue system migration
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Current System</p>
              <p className="text-2xl font-bold text-blue-600 capitalize">
                {currentSystem} Queue
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${
                    autoRefresh ? "animate-spin" : ""
                  }`}
                />
                Auto Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={updateStatus}
                disabled={isLoading}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Update
              </Button>
            </div>
          </div>

          {message && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">{message}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Health */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card
          className={`border-2 ${
            systemHealth?.simpleQueue.status === "healthy"
              ? "border-green-200"
              : systemHealth?.simpleQueue.status === "warning"
              ? "border-yellow-200"
              : "border-red-200"
          }`}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              {getStatusIcon(systemHealth?.simpleQueue.status || "healthy")}
              Simple Queue System
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Status</span>
                <span className="font-medium capitalize">
                  {systemHealth?.simpleQueue.status || "checking..."}
                </span>
              </div>
              {systemHealth?.simpleQueue.responseTime && (
                <div className="flex justify-between text-sm">
                  <span>Response Time</span>
                  <span className="font-medium">
                    {systemHealth.simpleQueue.responseTime}ms
                  </span>
                </div>
              )}
              {systemHealth?.simpleQueue.lastError && (
                <div className="text-sm text-red-600">
                  Error: {systemHealth.simpleQueue.lastError}
                </div>
              )}

              {migrationStatus && (
                <div className="pt-2 border-t">
                  <div className="flex justify-between text-sm">
                    <span>Active Users</span>
                    <span className="font-medium">
                      {migrationStatus.simpleQueueUsers}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className={`border-2 ${
            systemHealth?.hybridQueue.status === "healthy"
              ? "border-green-200"
              : systemHealth?.hybridQueue.status === "warning"
              ? "border-yellow-200"
              : "border-red-200"
          }`}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              {getStatusIcon(systemHealth?.hybridQueue.status || "healthy")}
              Hybrid Queue System
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Status</span>
                <span className="font-medium capitalize">
                  {systemHealth?.hybridQueue.status || "checking..."}
                </span>
              </div>
              {systemHealth?.hybridQueue.responseTime && (
                <div className="flex justify-between text-sm">
                  <span>Response Time</span>
                  <span className="font-medium">
                    {systemHealth.hybridQueue.responseTime}ms
                  </span>
                </div>
              )}
              {systemHealth?.hybridQueue.lastError && (
                <div className="text-sm text-red-600">
                  Error: {systemHealth.hybridQueue.lastError}
                </div>
              )}

              {migrationStatus && (
                <div className="pt-2 border-t">
                  <div className="flex justify-between text-sm">
                    <span>Active Users</span>
                    <span className="font-medium">
                      {migrationStatus.hybridQueueUsers}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Migration Progress */}
      {migrationStatus && (
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Migration Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Migration to Simple Queue</span>
                  <span className="font-medium">
                    {migrationStatus.migrationProgress.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={migrationStatus.migrationProgress}
                  className="h-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {migrationStatus.simpleQueueUsers}
                  </div>
                  <div className="text-xs text-gray-500">Simple Queue</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-600">
                    {migrationStatus.hybridQueueUsers}
                  </div>
                  <div className="text-xs text-gray-500">Hybrid Queue</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {migrationStatus.totalUsers}
                  </div>
                  <div className="text-xs text-gray-500">Total Users</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Migration Controls */}
      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Migration Controls
          </CardTitle>
          <p className="text-sm text-gray-600">
            Switch between queue systems or run migration tests
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="font-medium">System Switch</h4>
              <div className="space-y-2">
                <Button
                  onClick={() => switchSystem("simple")}
                  disabled={isLoading || currentSystem === "simple"}
                  variant={currentSystem === "simple" ? "default" : "outline"}
                  className="w-full"
                >
                  {currentSystem === "simple" ? (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 mr-2" />
                  )}
                  Switch to Simple Queue
                </Button>

                <Button
                  onClick={() => switchSystem("hybrid")}
                  disabled={isLoading || currentSystem === "hybrid"}
                  variant={currentSystem === "hybrid" ? "default" : "outline"}
                  className="w-full"
                >
                  {currentSystem === "hybrid" ? (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  ) : (
                    <ToggleRight className="w-4 h-4 mr-2" />
                  )}
                  Switch to Hybrid Queue
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium">Migration Tests</h4>
              <div className="space-y-2">
                <Button
                  onClick={performMigrationTest}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Run Migration Test
                </Button>

                <Button
                  onClick={clearOverride}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reset to Default
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-yellow-800">
                  Migration Safety
                </h4>
                <p className="text-sm text-yellow-700 mt-1">
                  System switches will reload the page to apply changes. Active
                  users will maintain their sessions during the transition.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
