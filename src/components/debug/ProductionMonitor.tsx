"use client";

import { useState, useEffect } from "react";

interface HealthStatus {
  status: string;
  services: {
    redis: { status: string; responseTime: number };
    queueProcessor: { status: string; isRunning: boolean };
    matching: { status: string; activeUsers: number };
  };
}

export function ProductionMonitor() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch("/api/health");
        const data = await response.json();
        setHealth(data);
        setLastCheck(new Date());
      } catch (error) {
        console.error("Health check failed:", error);
      }
    };

    // Check immediately and then every 30 seconds
    checkHealth();
    const interval = setInterval(checkHealth, 30000);

    return () => clearInterval(interval);
  }, []);

  // Only show in development or if there are issues
  if (process.env.NODE_ENV === "production" && health?.status === "healthy") {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white p-2 text-sm">
      <div className="container mx-auto flex justify-between items-center">
        <div>
          System Status: {health?.status || "Checking..."}
          {health && (
            <span className="ml-4">
              Redis: {health.services.redis.status} | Queue:{" "}
              {health.services.queueProcessor.isRunning ? "Running" : "Stopped"}{" "}
              | Users: {health.services.matching.activeUsers}
            </span>
          )}
        </div>
        {lastCheck && (
          <div className="text-xs">
            Last check: {lastCheck.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
