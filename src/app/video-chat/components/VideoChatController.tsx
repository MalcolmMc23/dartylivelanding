"use client";

import { useState, useCallback } from "react";
import { ChatState } from "./types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Video, Phone, PhoneOff, SkipForward, Users } from "lucide-react";

export default function VideoChatController() {
  const [chatState, setChatState] = useState<ChatState>("IDLE");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Handle Start Chat button click
  const handleStartChat = useCallback(() => {
    if (isTransitioning) return;

    setIsTransitioning(true);
    setChatState("WAITING_FOR_MATCH");

    // Brief transition delay for better UX
    setTimeout(() => setIsTransitioning(false), 300);
  }, [isTransitioning]);

  // Handle Skip button click (only available during IN_CALL)
  const handleSkip = useCallback(() => {
    if (isTransitioning || chatState !== "IN_CALL") return;

    setIsTransitioning(true);

    // Brief "Skipping..." state then back to waiting
    setTimeout(() => {
      setChatState("WAITING_FOR_MATCH");
      setIsTransitioning(false);
    }, 500);
  }, [isTransitioning, chatState]);

  // Handle End button click (only available during IN_CALL)
  const handleEnd = useCallback(() => {
    if (isTransitioning || chatState !== "IN_CALL") return;

    setIsTransitioning(true);
    setChatState("SHOWING_THANKS");

    setTimeout(() => setIsTransitioning(false), 300);
  }, [isTransitioning, chatState]);

  // Handle returning to idle from thanks screen
  const handleBackToIdle = useCallback(() => {
    if (isTransitioning) return;

    setIsTransitioning(true);
    setChatState("IDLE");

    setTimeout(() => setIsTransitioning(false), 300);
  }, [isTransitioning]);

  // Mock function to simulate getting matched (for testing UI)
  const handleMockMatch = useCallback(() => {
    if (chatState === "WAITING_FOR_MATCH") {
      setChatState("IN_CALL");
    }
  }, [chatState]);

  // Render different UI based on current state
  const renderStateContent = () => {
    switch (chatState) {
      case "IDLE":
        return (
          <Card className="p-8 bg-gray-900/80 border-gray-700 max-w-md w-full">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <Video className="h-16 w-16 text-blue-500" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Random Video Chat
                </h1>
                <p className="text-gray-300">
                  Connect with strangers from around the world
                </p>
              </div>
              <Button
                onClick={handleStartChat}
                disabled={isTransitioning}
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isTransitioning ? "Starting..." : "Start Chat"}
              </Button>
            </div>
          </Card>
        );

      case "WAITING_FOR_MATCH":
        return (
          <Card className="p-8 bg-gray-900/80 border-gray-700 max-w-md w-full">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <Users className="h-16 w-16 text-yellow-500 animate-pulse" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Finding someone to chat with...
                </h2>
                <p className="text-gray-300">
                  Please wait while we connect you
                </p>
              </div>
              <div className="flex space-x-3">
                <Button
                  onClick={handleBackToIdle}
                  variant="outline"
                  className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleMockMatch}
                  variant="outline"
                  className="flex-1 border-green-600 text-green-400 hover:bg-green-900/20"
                >
                  Mock Match (Test)
                </Button>
              </div>
            </div>
          </Card>
        );

      case "IN_CALL":
        return (
          <div className="w-full h-full relative">
            {/* Video call area placeholder */}
            <div className="w-full h-full bg-gray-900 flex items-center justify-center">
              <div className="text-center">
                <Video className="h-32 w-32 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">
                  Connected!
                </h2>
                <p className="text-gray-300">
                  Video call interface would be here
                </p>
              </div>
            </div>

            {/* Call controls */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
              <div className="flex space-x-4 bg-black/50 p-4 rounded-lg backdrop-blur-sm">
                <Button
                  onClick={handleSkip}
                  disabled={isTransitioning}
                  variant="outline"
                  size="lg"
                  className="border-yellow-600 text-yellow-400 hover:bg-yellow-900/20"
                >
                  <SkipForward className="h-5 w-5 mr-2" />
                  {isTransitioning ? "Skipping..." : "Skip"}
                </Button>
                <Button
                  onClick={handleEnd}
                  disabled={isTransitioning}
                  size="lg"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <PhoneOff className="h-5 w-5 mr-2" />
                  {isTransitioning ? "Ending..." : "End"}
                </Button>
              </div>
            </div>
          </div>
        );

      case "SHOWING_THANKS":
        return (
          <Card className="p-8 bg-gray-900/80 border-gray-700 max-w-md w-full">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <Phone className="h-16 w-16 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Thanks for chatting!
                </h2>
                <p className="text-gray-300">
                  Hope you had a great conversation
                </p>
              </div>
              <div className="flex space-x-3">
                <Button
                  onClick={handleStartChat}
                  disabled={isTransitioning}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Chat Again
                </Button>
                <Button
                  onClick={handleBackToIdle}
                  disabled={isTransitioning}
                  variant="outline"
                  className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  Back to Home
                </Button>
              </div>
            </div>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center overflow-hidden">
      {/* Debug info (remove in production) */}
      <div className="absolute top-4 left-4 text-xs text-gray-500 bg-black/50 px-3 py-1 rounded">
        State: {chatState}
      </div>

      {renderStateContent()}
    </div>
  );
}
