"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Video, Users, AlertCircle } from "lucide-react";
import { ChatState } from "@/types/random-chat";

interface ChatLobbyProps {
  chatState: ChatState;
  userId: string | null;
  error: string;
  startMatching: () => void;
  cancelWaiting: () => void;
  onCheckStatus: () => void;
  onForceCleanup: () => void;
}

export function ChatLobby({
  chatState,
  userId,
  error,
  startMatching,
  cancelWaiting,
  onCheckStatus,
  onForceCleanup,
}: ChatLobbyProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
      <Card className="p-8 bg-gray-900/80 border-gray-700 max-w-md w-full">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            {chatState === "WAITING" || chatState === "CONNECTING" ? (
              <Users className="h-16 w-16 text-yellow-500 animate-pulse" />
            ) : (
              <Video className="h-16 w-16 text-blue-500" />
            )}
          </div>

          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {chatState === "IDLE" && "Random Video Chat"}
              {chatState === "WAITING" && "Finding someone..."}
              {chatState === "CONNECTING" && "Connecting..."}
            </h1>
            <p className="text-gray-300">
              {chatState === "IDLE" && "Connect with random people instantly"}
              {chatState === "WAITING" &&
                "Please wait while we find someone to chat with"}
              {chatState === "CONNECTING" && "Setting up your video connection"}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {userId ? `Your ID: ${userId}` : "Loading ID..."}
            </p>
          </div>

          {/* Debug buttons */}
          <div className="flex gap-2 justify-center">
            <button
              onClick={onCheckStatus}
              className="text-xs text-gray-400 underline"
            >
              Check Status
            </button>
            <button
              onClick={onForceCleanup}
              className="text-xs text-gray-400 underline"
            >
              Force Cleanup
            </button>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-3">
              <div className="flex items-center space-x-2 text-red-300">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {chatState === "IDLE" && (
            <Button
              onClick={startMatching}
              size="lg"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Start Chat
            </Button>
          )}

          {(chatState === "WAITING" || chatState === "CONNECTING") && (
            <Button
              onClick={cancelWaiting}
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
