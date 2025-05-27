"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, Clock, TrendingUp, AlertCircle } from "lucide-react";

interface QueuePositionIndicatorProps {
  username: string;
  className?: string;
}

interface QueuePositionData {
  position: number;
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
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!username) return;

    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const fetchPosition = async () => {
      if (!isMounted) return;

      try {
        const response = await fetch(
          `/api/queue-position?username=${encodeURIComponent(username)}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch position: ${response.status}`);
        }

        const data = await response.json();

        if (isMounted) {
          setPositionData(data);
          setError(null);
          setRetryCount(0);
        }
      } catch (err) {
        console.error("Error fetching queue position:", err);
        if (isMounted) {
          setError("Unable to fetch queue position");
          setRetryCount((prev) => prev + 1);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    fetchPosition();

    // Set up polling with exponential backoff on errors
    const setupPolling = () => {
      const baseInterval = 2000; // 2 seconds
      const maxInterval = 10000; // 10 seconds
      const interval = Math.min(
        baseInterval * Math.pow(1.5, retryCount),
        maxInterval
      );

      timeoutId = setTimeout(() => {
        if (isMounted) {
          fetchPosition();
          setupPolling();
        }
      }, interval);
    };

    setupPolling();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [username, retryCount]);

  if (isLoading) {
    return (
      <Card className={`${className} animate-pulse`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-600">
              Loading queue position...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`${className} border-red-200 bg-red-50`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-center text-red-600">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span className="text-sm">{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!positionData) {
    return null;
  }

  const { position, estimatedWait, queueStats } = positionData;
  const isPriority = queueStats.yourState === "in_call";
  const isWaiting = !isPriority && position > 0;
  const queueLength = isPriority
    ? queueStats.totalInCall
    : queueStats.totalWaiting;

  return (
    <Card
      className={`${className} ${
        isPriority ? "border-blue-500 bg-blue-50/50" : ""
      } transition-all duration-300`}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Position Display */}
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-800 animate-fade-in">
              {position > 0 ? `#${position}` : "Processing..."}
            </div>
            <div className="text-sm text-gray-600">
              {isPriority ? "Priority Queue" : "In Queue"}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="w-4 h-4" />
              <span>{queueLength} waiting</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <TrendingUp className="w-4 h-4" />
              <span>{queueStats.activeMatches} active</span>
            </div>
          </div>

          {/* Estimated Wait Time */}
          <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
            <Clock className="w-4 h-4" />
            <span className="font-medium">{estimatedWait}</span>
          </div>

          {/* Priority Badge */}
          {isPriority && (
            <div className="text-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">
                Priority Matching
              </span>
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
