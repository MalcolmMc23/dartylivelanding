"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Clock, TrendingUp } from "lucide-react";

interface QueuePositionIndicatorProps {
  username: string;
  className?: string;
}

interface QueuePositionData {
  position: number | null;
  estimatedWait: string;
  queueStats: {
    totalWaiting: number;
    totalInCall: number;
    activeMatches: number;
    yourState: string | null;
  };
  timestamp: number;
}

export function QueuePositionIndicator({
  username,
  className = "",
}: QueuePositionIndicatorProps) {
  const [positionData, setPositionData] = useState<QueuePositionData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) {
      setIsLoading(false);
      return;
    }

    const fetchPosition = async () => {
      try {
        setError(null);
        const response = await fetch(
          `/api/queue-position?username=${encodeURIComponent(username)}`
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setPositionData(data);
      } catch (err) {
        console.error("Error fetching queue position:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch position"
        );
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchPosition();

    // Poll every 3 seconds for updates
    const interval = setInterval(fetchPosition, 3000);

    return () => clearInterval(interval);
  }, [username]);

  // Don't render if user is not in queue
  if (!username || (!isLoading && !positionData?.position)) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className={`border border-blue-200 bg-blue-50 ${className}`}>
        <CardContent className="p-3">
          <div className="flex items-center justify-center text-sm text-blue-600">
            <Clock className="w-4 h-4 mr-2 animate-spin" />
            Checking queue position...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`border border-red-200 bg-red-50 ${className}`}>
        <CardContent className="p-3">
          <div className="flex items-center text-sm text-red-600">
            <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
            Unable to get queue position
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!positionData) {
    return null;
  }

  const { position, estimatedWait, queueStats } = positionData;
  const isInCall = queueStats.yourState === "in_call";
  const isWaiting = queueStats.yourState === "waiting";

  return (
    <Card
      className={`border ${
        isInCall ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"
      } ${className}`}
    >
      <CardContent className="p-3 space-y-2">
        {/* Main position info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {isInCall ? (
              <TrendingUp className="w-4 h-4 mr-2 text-green-600" />
            ) : (
              <Users className="w-4 h-4 mr-2 text-blue-600" />
            )}
            <span
              className={`text-sm font-medium ${
                isInCall ? "text-green-700" : "text-blue-700"
              }`}
            >
              {position ? `Position #${position}` : "In Queue"}
            </span>
          </div>
          <span
            className={`text-xs ${
              isInCall ? "text-green-600" : "text-blue-600"
            }`}
          >
            {isInCall ? "Priority" : "Waiting"}
          </span>
        </div>

        {/* Wait time */}
        {estimatedWait && (
          <div className="flex items-center text-xs text-gray-600">
            <Clock className="w-3 h-3 mr-1" />
            <span>{estimatedWait}</span>
          </div>
        )}

        {/* Queue stats */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-200">
          <span>{queueStats.totalWaiting} waiting</span>
          <span>{queueStats.totalInCall} priority</span>
          <span>{queueStats.activeMatches} chatting</span>
        </div>

        {/* Status message */}
        {isInCall && (
          <div className="text-xs text-green-600 font-medium">
            🚀 You have priority matching after skip!
          </div>
        )}

        {isWaiting && position === 1 && (
          <div className="text-xs text-blue-600 font-medium">
            🎯 You&apos;re next in line!
          </div>
        )}
      </CardContent>
    </Card>
  );
}
