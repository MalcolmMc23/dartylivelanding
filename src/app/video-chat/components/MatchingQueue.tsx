"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MatchingQueueProps } from "./types";

export default function MatchingQueue({ onCancel }: MatchingQueueProps) {
  const [dots, setDots] = useState(".");
  const [queuePosition, setQueuePosition] = useState(
    Math.floor(Math.random() * 50) + 10
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === "...") return ".";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Simulate queue position decreasing
    const interval = setInterval(() => {
      setQueuePosition((prev) => {
        if (prev > 1) {
          return prev - 1;
        }
        return prev;
      });
    }, 1000 + Math.random() * 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
          <CardContent className="p-8 text-center space-y-6">
            {/* Loading Animation */}
            <div className="relative">
              <div className="w-24 h-24 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-gray-600"></div>
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 animate-spin"></div>
                <div
                  className="absolute inset-2 rounded-full border-4 border-transparent border-t-blue-500 animate-spin"
                  style={{ animationDirection: "reverse" }}
                ></div>
              </div>
            </div>

            {/* Status Text */}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">
                Finding a match{dots}
              </h2>
              <p className="text-gray-300">Connecting you with someone new</p>
            </div>

            {/* Queue Info */}
            <div className="bg-gray-700/50 rounded-lg p-4 space-y-2">
              <div className="text-sm text-gray-400">Position in queue</div>
              <div className="text-3xl font-bold text-blue-400">
                #{queuePosition}
              </div>
            </div>

            {/* Tips */}
            <div className="text-left space-y-2 text-sm text-gray-400">
              <div className="font-medium text-gray-300">While you wait:</div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Make sure your camera and microphone are working</li>
                <li>Find a well-lit area for better video quality</li>
                <li>Be respectful and follow community guidelines</li>
              </ul>
            </div>

            {/* Cancel Button */}
            <Button
              onClick={onCancel}
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              Cancel Search
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
