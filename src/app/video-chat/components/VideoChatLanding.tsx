"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VideoChatLandingProps } from "./types";
import Typewriter from "./Typewriter";

export default function VideoChatLanding({
  onStartChat,
}: VideoChatLandingProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <Typewriter className="mb-6" />
          <p className="text-gray-300 text-lg max-w-lg mx-auto">
            Connect with random strangers in anonymous video chats. Meet new
            people from around the world instantly.
          </p>
        </div>

        {/* Main Card */}
        <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
          <CardContent className="p-8">
            <div className="space-y-6">
              {/* Features */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Anonymous & Private</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>HD Video Quality</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span>Instant Matching</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span>Skip & Next Options</span>
                </div>
              </div>

              {/* Start Button */}
              <div className="text-center pt-4">
                <Button
                  onClick={onStartChat}
                  size="lg"
                  className="w-full md:w-auto px-12 py-4 text-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transition-all duration-200 transform hover:scale-105"
                >
                  Start Video Chat
                </Button>
              </div>

              {/* Disclaimer */}
              <div className="text-xs text-gray-400 text-center space-y-2 pt-4 border-t border-gray-700">
                <p>
                  By clicking &quot;Start Video Chat&quot;, you agree to our
                  terms of service.
                </p>
                <p>Please be respectful and follow community guidelines.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats (Optional Mock Data) */}
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div className="space-y-1">
            <div className="text-2xl font-bold text-green-400">24/7</div>
            <div className="text-gray-400">Available</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-blue-400">1000+</div>
            <div className="text-gray-400">Online Now</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-purple-400">Safe</div>
            <div className="text-gray-400">& Secure</div>
          </div>
        </div>
      </div>
    </div>
  );
}
