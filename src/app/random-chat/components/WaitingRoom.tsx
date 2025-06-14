import { Video, Users, AlertCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { DebugButtons } from "./DebugButtons";
import AnimatedStars from "@/components/animations/AnimatedStars";
import Typewriter from "@/components/animations/Typewriter";
import { WaitingRoomProps } from "../types";
// Debug flag to bypass authentication
const BYPASS_AUTH = process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true';



export function WaitingRoom({
  chatState,
  error,
  userId,
  onStart,
  onCancel,
  onCheckStatus,
  onForceCleanup,
  showDebug = false,
}: WaitingRoomProps) {
  const [mounted, setMounted] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleStartChat = () => {
    if (BYPASS_AUTH || session) {
      onStart();
    } else {
      setShowLogin(true);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-[#121212] text-white p-4 md:p-8">
      <AnimatedStars />
      
      <div className="relative z-10 w-full max-w-md p-8 bg-[#1A1A1A] rounded-2xl shadow-2xl backdrop-blur-sm border border-[#2A2A2A]">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            {chatState === "WAITING" || chatState === "CONNECTING" ? (
              <Users className="h-16 w-16 text-yellow-500 animate-pulse" />
            ) : (
              <Video className="h-16 w-16 text-[#A855F7]" />
            )}
          </div>

          <div>
            <Typewriter className="mb-4" />
            <p className="text-gray-300">
              {chatState === "IDLE" && "Connect with random people instantly"}
              {chatState === "WAITING" &&
                "Please wait while we find someone to chat with"}
              {chatState === "CONNECTING" && "Setting up your video connection"}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {mounted ? `Your ID: ${userId}` : "Loading ID..."}
            </p>
          </div>

          {showDebug && (
            <DebugButtons
              onCheckStatus={onCheckStatus}
              onForceCleanup={onForceCleanup}
            />
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-3">
              <div className="flex items-center space-x-2 text-red-300">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {chatState === "IDLE" && (
            <button
              onClick={handleStartChat}
              className="w-full bg-[#A855F7] text-white px-3.5 py-4 rounded-xl font-semibold hover:cursor-pointer hover:bg-[#9333EA] transition-all duration-200 shadow-lg shadow-[#A855F7]/20 flex items-center justify-center gap-2"
            >
              <span>Start Random Call</span>
              <Sparkles className="h-6 w-6" />
            </button>
          )}

          {(chatState === "WAITING" || chatState === "CONNECTING") && (
            <button
              onClick={onCancel}
              className="w-full border border-[#2A2A2A] text-gray-300 px-3.5 py-4 rounded-xl font-semibold hover:cursor-pointer hover:bg-[#2A2A2A] transition-all duration-200"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <LoginDialog 
        open={showLogin} 
        onOpenChange={setShowLogin}
        onSuccess={() => {
          onStart();
        }}
      />
    </div>
  );
} 