"use client";

import { useState, useCallback, useEffect } from "react";
import { ChatState } from "./types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Video,
  Phone,
  PhoneOff,
  SkipForward,
  Users,
  AlertCircle,
} from "lucide-react";
import { useMatchingAPI } from "../hooks/useMatchingAPI";
import { useLiveKit } from "../hooks/useLiveKit";
import LiveKitVideoCall from "./LiveKitVideoCall";

// Mock user ID - in production, this would come from authentication
const MOCK_USER_ID = `user_${Date.now()}_${Math.random()
  .toString(36)
  .substr(2, 9)}`;

// LiveKit server URL - this would come from environment variables
const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

export default function VideoChatController() {
  const [chatState, setChatState] = useState<ChatState>("IDLE");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Hooks for API integration
  const matchingAPI = useMatchingAPI();
  const liveKit = useLiveKit();

  // Handle Start Chat button click
  const handleStartChat = useCallback(async () => {
    if (isTransitioning || matchingAPI.isLoading) return;

    setIsTransitioning(true);
    setChatState("WAITING_FOR_MATCH");
    matchingAPI.clearError();
    liveKit.clearError();

    try {
      // Request a match from the matching service
      const session = await matchingAPI.requestMatch(MOCK_USER_ID);

      if (session) {
        // Connect to LiveKit room with the provided token
        await liveKit.connect(LIVEKIT_URL, session.accessToken);
        setChatState("IN_CALL");
      } else {
        // Handle error - go back to waiting or show error
        setChatState("WAITING_FOR_MATCH");
      }
    } catch (error) {
      console.error("Error starting chat:", error);
      setChatState("WAITING_FOR_MATCH");
    } finally {
      setIsTransitioning(false);
    }
  }, [isTransitioning, matchingAPI, liveKit]);

  // Handle Skip button click (only available during IN_CALL)
  const handleSkip = useCallback(async () => {
    if (
      isTransitioning ||
      chatState !== "IN_CALL" ||
      !matchingAPI.currentSession
    )
      return;

    setIsTransitioning(true);

    try {
      // Disconnect from current LiveKit room
      await liveKit.disconnect();

      // Skip current match and find new one
      const newSession = await matchingAPI.skipMatch(
        matchingAPI.currentSession.sessionId,
        MOCK_USER_ID
      );

      if (newSession) {
        // Connect to new LiveKit room
        await liveKit.connect(LIVEKIT_URL, newSession.accessToken);
        // Stay in IN_CALL state
      } else {
        // If skip failed, go back to waiting
        setChatState("WAITING_FOR_MATCH");
      }
    } catch (error) {
      console.error("Error skipping match:", error);
      setChatState("WAITING_FOR_MATCH");
    } finally {
      setIsTransitioning(false);
    }
  }, [isTransitioning, chatState, matchingAPI, liveKit]);

  // Handle End button click (only available during IN_CALL)
  const handleEnd = useCallback(async () => {
    if (
      isTransitioning ||
      chatState !== "IN_CALL" ||
      !matchingAPI.currentSession
    )
      return;

    setIsTransitioning(true);

    try {
      // Disconnect from LiveKit room
      await liveKit.disconnect();

      // End the session
      await matchingAPI.endMatch(
        matchingAPI.currentSession.sessionId,
        MOCK_USER_ID
      );

      setChatState("SHOWING_THANKS");
    } catch (error) {
      console.error("Error ending chat:", error);
      setChatState("SHOWING_THANKS"); // Still show thanks even if API fails
    } finally {
      setIsTransitioning(false);
    }
  }, [isTransitioning, chatState, matchingAPI, liveKit]);

  // Handle returning to idle from thanks screen
  const handleBackToIdle = useCallback(async () => {
    if (isTransitioning) return;

    setIsTransitioning(true);

    // Ensure we're disconnected from any room
    await liveKit.disconnect();
    matchingAPI.clearSession();

    setChatState("IDLE");
    setTimeout(() => setIsTransitioning(false), 300);
  }, [isTransitioning, liveKit, matchingAPI]);

  // Handle cancel from waiting state
  const handleCancel = useCallback(async () => {
    if (isTransitioning) return;

    setIsTransitioning(true);

    // Clean up any pending connections
    await liveKit.disconnect();
    matchingAPI.clearSession();

    setChatState("IDLE");
    setTimeout(() => setIsTransitioning(false), 300);
  }, [isTransitioning, liveKit, matchingAPI]);

  // Monitor LiveKit connection status
  useEffect(() => {
    if (liveKit.isConnected && chatState === "WAITING_FOR_MATCH") {
      setChatState("IN_CALL");
    }
  }, [liveKit.isConnected, chatState]);

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

              {/* Show errors */}
              {(matchingAPI.error || liveKit.error) && (
                <div className="bg-red-900/50 border border-red-500 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-red-300">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">
                      {matchingAPI.error || liveKit.error}
                    </span>
                  </div>
                </div>
              )}

              <Button
                onClick={handleStartChat}
                disabled={isTransitioning || matchingAPI.isLoading}
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isTransitioning || matchingAPI.isLoading
                  ? "Starting..."
                  : "Start Chat"}
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
                  {liveKit.isConnecting
                    ? "Connecting to video..."
                    : "Finding someone to chat with..."}
                </h2>
                <p className="text-gray-300">
                  {liveKit.isConnecting
                    ? "Setting up your video connection"
                    : "Please wait while we connect you"}
                </p>
              </div>

              {/* Show errors */}
              {(matchingAPI.error || liveKit.error) && (
                <div className="bg-red-900/50 border border-red-500 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-red-300">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">
                      {matchingAPI.error || liveKit.error}
                    </span>
                  </div>
                </div>
              )}

              <Button
                onClick={handleCancel}
                disabled={isTransitioning}
                variant="outline"
                className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </Button>
            </div>
          </Card>
        );

      case "IN_CALL":
        return (
          <div className="w-full h-full relative">
            {/* Video call area */}
            <LiveKitVideoCall
              localParticipant={liveKit.localParticipant}
              remoteParticipants={liveKit.remoteParticipants}
              className="w-full h-full"
            />

            {/* Call controls */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
              <div className="flex space-x-4 bg-black/50 p-4 rounded-lg backdrop-blur-sm">
                <Button
                  onClick={handleSkip}
                  disabled={isTransitioning || matchingAPI.isLoading}
                  variant="outline"
                  size="lg"
                  className="border-yellow-600 text-yellow-400 hover:bg-yellow-900/20"
                >
                  <SkipForward className="h-5 w-5 mr-2" />
                  {isTransitioning || matchingAPI.isLoading
                    ? "Skipping..."
                    : "Skip"}
                </Button>
                <Button
                  onClick={handleEnd}
                  disabled={isTransitioning || matchingAPI.isLoading}
                  size="lg"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <PhoneOff className="h-5 w-5 mr-2" />
                  {isTransitioning || matchingAPI.isLoading
                    ? "Ending..."
                    : "End"}
                </Button>
              </div>
            </div>

            {/* Connection status */}
            {!liveKit.isConnected && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-yellow-900/50 border border-yellow-500 rounded-lg px-4 py-2">
                  <span className="text-yellow-300 text-sm">
                    Reconnecting...
                  </span>
                </div>
              </div>
            )}
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
                  disabled={isTransitioning || matchingAPI.isLoading}
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
      <div className="absolute top-4 left-4 text-xs text-gray-500 bg-black/50 px-3 py-1 rounded space-y-1">
        <div>State: {chatState}</div>
        <div>Matching: {matchingAPI.isLoading ? "Loading" : "Idle"}</div>
        <div>
          LiveKit:{" "}
          {liveKit.isConnected
            ? "Connected"
            : liveKit.isConnecting
            ? "Connecting"
            : "Disconnected"}
        </div>
        {matchingAPI.currentSession && (
          <div>
            Session: {matchingAPI.currentSession.sessionId.slice(0, 8)}...
          </div>
        )}
      </div>

      {renderStateContent()}
    </div>
  );
}
