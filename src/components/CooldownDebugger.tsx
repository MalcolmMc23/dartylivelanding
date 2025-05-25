"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CooldownDebuggerProps {
  username: string;
  className?: string;
}

interface CooldownInfo {
  user1: string;
  user2: string;
  remaining: number;
  type: string;
}

export function CooldownDebugger({
  username,
  className = "",
}: CooldownDebuggerProps) {
  const [cooldowns, setCooldowns] = useState<CooldownInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testUser, setTestUser] = useState("");

  const fetchCooldowns = useCallback(async () => {
    if (!username) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/debug/cooldowns?username=${encodeURIComponent(username)}`
      );
      if (response.ok) {
        const data = await response.json();
        setCooldowns(data.cooldowns || []);
      }
    } catch (error) {
      console.error("Error fetching cooldowns:", error);
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  const clearCooldown = async (otherUser: string) => {
    try {
      const response = await fetch("/api/debug/cooldowns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user1: username, user2: otherUser }),
      });

      if (response.ok) {
        fetchCooldowns(); // Refresh the list
      }
    } catch (error) {
      console.error("Error clearing cooldown:", error);
    }
  };

  const testCooldown = async (type: "normal" | "skip") => {
    if (!testUser.trim()) return;

    try {
      const response = await fetch("/api/debug/cooldowns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user1: username,
          user2: testUser.trim(),
          type,
        }),
      });

      if (response.ok) {
        fetchCooldowns(); // Refresh the list
        setTestUser(""); // Clear input
      }
    } catch (error) {
      console.error("Error setting cooldown:", error);
    }
  };

  useEffect(() => {
    fetchCooldowns();
    const interval = setInterval(fetchCooldowns, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [username, fetchCooldowns]);

  if (!username) {
    return null;
  }

  return (
    <Card className={`w-full max-w-md ${className}`}>
      <CardHeader>
        <CardTitle className="text-sm">Cooldown Debugger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={fetchCooldowns}
            disabled={isLoading}
            size="sm"
            variant="outline"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        {/* Test cooldown section */}
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Test user"
            value={testUser}
            onChange={(e) => setTestUser(e.target.value)}
            className="w-full px-2 py-1 text-sm border rounded"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => testCooldown("normal")}
              size="sm"
              variant="outline"
              disabled={!testUser.trim()}
            >
              Set Normal (30s)
            </Button>
            <Button
              onClick={() => testCooldown("skip")}
              size="sm"
              variant="outline"
              disabled={!testUser.trim()}
            >
              Set Skip (2m)
            </Button>
          </div>
        </div>

        {/* Active cooldowns */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Active Cooldowns:</h4>
          {cooldowns.length === 0 ? (
            <p className="text-xs text-gray-500">No active cooldowns</p>
          ) : (
            cooldowns.map((cooldown, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded"
              >
                <div>
                  <div className="font-medium">
                    {cooldown.user1} ↔ {cooldown.user2}
                  </div>
                  <div className="text-gray-500">
                    {cooldown.remaining}s remaining ({cooldown.type})
                  </div>
                </div>
                <Button
                  onClick={() =>
                    clearCooldown(
                      cooldown.user1 === username
                        ? cooldown.user2
                        : cooldown.user1
                    )
                  }
                  size="sm"
                  variant="destructive"
                  className="text-xs px-2 py-1"
                >
                  Clear
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
