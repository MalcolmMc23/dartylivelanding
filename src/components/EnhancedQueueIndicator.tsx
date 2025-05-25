"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, Clock, TrendingUp } from "lucide-react";

interface QueueStats {
  position: number;
  totalWaiting: number;
  totalInCall: number;
  activeMatches: number;
  estimatedWait: string;
  yourState: string | null;
}

interface EnhancedQueueIndicatorProps {
  username: string;
  className?: string;
}

export function EnhancedQueueIndicator({
  username,
  className = "",
}: EnhancedQueueIndicatorProps) {
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;

    const fetchQueuePosition = async () => {
      try {
        const response = await fetch(
          `/api/queue-position?username=${encodeURIComponent(username)}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch queue position");
        }
        const data = await response.json();

        setQueueStats({
          position: data.position || 0,
          totalWaiting: data.queueStats?.totalWaiting || 0,
          totalInCall: data.queueStats?.totalInCall || 0,
          activeMatches: data.queueStats?.activeMatches || 0,
          estimatedWait: data.estimatedWait || "Calculating...",
          yourState: data.queueStats?.yourState || null,
        });
        setError(null);
      } catch (err) {
        console.error("Error fetching queue position:", err);
        setError("Unable to fetch queue position");
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchQueuePosition();

    // Poll every 2 seconds for updates
    const interval = setInterval(fetchQueuePosition, 2000);

    return () => clearInterval(interval);
  }, [username]);

  if (isLoading) {
    return (
      <Card className={`${className} animate-pulse`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !queueStats) {
    return null;
  }

  const isPriority = queueStats.yourState === "in_call";
  const queueLength = isPriority
    ? queueStats.totalInCall
    : queueStats.totalWaiting;

  return (
    <Card
      className={`${className} ${
        isPriority ? "border-blue-500 bg-blue-50/50" : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Position Display */}
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-800">
              {queueStats.position > 0
                ? `#${queueStats.position}`
                : "Processing..."}
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
            <span className="font-medium">{queueStats.estimatedWait}</span>
          </div>

          {/* Priority Badge */}
          {isPriority && (
            <div className="text-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Priority Matching
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
