"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Badge component inline since ui/badge doesn't exist
const Badge = ({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}) => {
  const baseClasses =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";
  const variantClasses = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-input bg-background",
  };
  return (
    <span className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
};
import { AlertCircle, RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface ClientStateDebuggerProps {
  username: string;
  roomName?: string;
  isInRoom?: boolean;
  isSearching?: boolean;
}

export function ClientStateDebugger({
  username,
  roomName,
  isInRoom = false,
  isSearching = false,
}: ClientStateDebuggerProps) {
  const [serverState, setServerState] = useState<{
    status?: string;
    roomName?: string;
    matchedWith?: string;
    error?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);

  const checkServerState = useCallback(async () => {
    setIsLoading(true);
    try {
      // Check user's status on the server
      const response = await fetch(
        `/api/match-user?username=${encodeURIComponent(username)}`
      );
      const data = await response.json();
      setServerState(data);
    } catch (error) {
      console.error("Error checking server state:", error);
      setServerState({ error: "Failed to check server state" });
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  const fixStuckState = async () => {
    setIsLoading(true);
    setFixResult(null);
    try {
      // First, cancel any existing match request
      await fetch("/api/match-user", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, action: "cancel" }),
      });

      // Clear local storage
      if (typeof window !== "undefined") {
        window.sessionStorage.clear();
        window.localStorage.clear();
      }

      // If user thinks they're in a room, try to leave it
      if (isInRoom && roomName) {
        try {
          await fetch("/api/leave-room", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, roomName }),
          });
        } catch (e) {
          console.error("Error leaving room:", e);
        }
      }

      setFixResult("State cleared! Please refresh the page.");

      // Refresh after a short delay
      setTimeout(() => {
        window.location.href = `/video-chat?username=${encodeURIComponent(
          username
        )}`;
      }, 2000);
    } catch (error) {
      console.error("Error fixing stuck state:", error);
      setFixResult("Error fixing state. Please try refreshing the page.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkServerState();
  }, [checkServerState]);

  const hasStateMismatch = () => {
    if (!serverState || serverState.error) return false;

    // Check for mismatches
    if (isInRoom && serverState.status !== "matched") return true;
    if (isSearching && serverState.status !== "waiting") return true;
    if (!isInRoom && !isSearching && serverState.status !== "not_found")
      return true;

    return false;
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          State Debugger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Client State */}
        <div>
          <h4 className="font-medium text-sm mb-2">Client State</h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Username: {username}</Badge>
            {roomName && <Badge variant="outline">Room: {roomName}</Badge>}
            <Badge variant={isInRoom ? "default" : "secondary"}>
              In Room: {isInRoom ? "Yes" : "No"}
            </Badge>
            <Badge variant={isSearching ? "default" : "secondary"}>
              Searching: {isSearching ? "Yes" : "No"}
            </Badge>
          </div>
        </div>

        {/* Server State */}
        {serverState && (
          <div>
            <h4 className="font-medium text-sm mb-2">Server State</h4>
            {serverState.error ? (
              <Badge variant="destructive">{serverState.error}</Badge>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Status: {serverState.status}</Badge>
                {serverState.roomName && (
                  <Badge variant="outline">Room: {serverState.roomName}</Badge>
                )}
                {serverState.matchedWith && (
                  <Badge variant="outline">
                    Matched With: {serverState.matchedWith}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {/* State Mismatch Warning */}
        {hasStateMismatch() && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <XCircle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              Client and server states don&apos;t match!
            </span>
          </div>
        )}

        {/* Fix Result */}
        {fixResult && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-800">{fixResult}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={checkServerState}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button
            onClick={fixStuckState}
            disabled={isLoading}
            variant="destructive"
            size="sm"
            className="flex-1"
          >
            Fix Stuck State
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
