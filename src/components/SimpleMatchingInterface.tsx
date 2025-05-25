"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Users, Settings, Globe, Monitor } from "lucide-react";
import { SimpleQueueManager } from "./SimpleQueueManager";
import { useSimpleQueue, setQueueSystemOverride } from "@/utils/featureFlags";

interface SimpleMatchingInterfaceProps {
  initialUsername?: string;
  onUsernameChange?: (username: string) => void;
}

export function SimpleMatchingInterface({
  initialUsername = "",
  onUsernameChange,
}: SimpleMatchingInterfaceProps) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [useDemo, setUseDemo] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isReady, setIsReady] = useState(!!initialUsername);
  const isUsingSimpleQueue = useSimpleQueue();

  useEffect(() => {
    if (initialUsername) {
      setUsername(initialUsername);
      setIsReady(true);
    }
  }, [initialUsername]);

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsReady(true);
      if (onUsernameChange) {
        onUsernameChange(username.trim());
      }
    }
  };

  const handleMatched = (roomName: string, matchedWith: string) => {
    router.push(
      `/video-chat/room/${encodeURIComponent(
        roomName
      )}?username=${encodeURIComponent(
        username
      )}&matchedWith=${encodeURIComponent(matchedWith)}&useDemo=${useDemo}`
    );
  };

  const handleError = (error: string) => {
    console.error("Matching error:", error);
    // Could show a toast notification here
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-2 border-blue-200 shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              💬 Start Chatting
            </CardTitle>
            <p className="text-gray-600 mt-2">
              Meet new people from around the world
            </p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleUsernameSubmit} className="space-y-4">
              <div>
                <Label
                  htmlFor="username"
                  className="text-sm font-medium text-gray-700"
                >
                  Choose a username
                </Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username..."
                  className="mt-1"
                  autoFocus
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3"
                disabled={!username.trim()}
              >
                <Zap className="w-5 h-5 mr-2" />
                Enter Chat
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Globe className="w-4 h-4" />
                <span>Anonymous • Safe • Fun</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            💬 Video Chat
          </h1>
          <p className="text-gray-600 text-lg">
            Welcome back,{" "}
            <span className="font-semibold text-blue-600">{username}</span>!
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Matching Interface */}
          <div className="lg:col-span-2">
            <SimpleQueueManager
              username={username}
              useDemo={useDemo}
              onMatched={handleMatched}
              onError={handleError}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Settings Card */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Server Mode</p>
                    <p className="text-xs text-gray-500">
                      {useDemo ? "Demo server" : "Production server"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUseDemo(!useDemo)}
                  >
                    <Monitor className="w-4 h-4 mr-1" />
                    {useDemo ? "Demo" : "Prod"}
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Change Username</p>
                    <p className="text-xs text-gray-500">
                      Start over with new name
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsReady(false)}
                  >
                    Change
                  </Button>
                </div>

                {/* Advanced Settings Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full text-xs"
                >
                  {showAdvanced ? "Hide" : "Show"} Advanced
                </Button>

                {showAdvanced && (
                  <div className="space-y-3 pt-2 border-t">
                    <div>
                      <p className="font-medium text-sm mb-2">Queue System</p>
                      <div className="space-y-2">
                        <Button
                          variant={isUsingSimpleQueue ? "default" : "outline"}
                          size="sm"
                          onClick={() => setQueueSystemOverride("simple")}
                          className="w-full text-xs"
                        >
                          Simple Queue {isUsingSimpleQueue && "✓"}
                        </Button>
                        <Button
                          variant={!isUsingSimpleQueue ? "default" : "outline"}
                          size="sm"
                          onClick={() => setQueueSystemOverride("hybrid")}
                          className="w-full text-xs"
                        >
                          Hybrid Queue {!isUsingSimpleQueue && "✓"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* How it Works */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  How it Works
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-gray-600">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                      1
                    </div>
                    <p>Click &ldquo;Find Random Match&rdquo; to start</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                      2
                    </div>
                    <p>You&apos;ll be matched with someone instantly</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                      3
                    </div>
                    <p>Chat, skip to next person, or leave anytime</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Safety Tips */}
            <Card className="border border-yellow-200 bg-yellow-50">
              <CardContent className="pt-4">
                <h4 className="font-semibold text-yellow-800 mb-2 text-sm">
                  🛡️ Stay Safe
                </h4>
                <ul className="text-xs text-yellow-700 space-y-1">
                  <li>• Don&apos;t share personal information</li>
                  <li>• Report inappropriate behavior</li>
                  <li>• You can leave or skip at any time</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
