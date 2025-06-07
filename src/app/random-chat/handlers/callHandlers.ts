import { api } from "../utils/api";
import { MatchData } from "../types";
import { ChatState } from "../types";

interface CallHandlersProps {
  userId: string;
  sessionId: string;
  isEndingCall: React.MutableRefObject<boolean>;
  isSkipping: React.MutableRefObject<boolean>;
  stopPolling: () => void;
  stopHeartbeat: () => void;
  disconnectFromRoom: () => Promise<void>;
  connectToRoom: (roomName: string) => Promise<boolean>;
  setChatState: (state: ChatState) => void;
  setSessionId: (id: string) => void;
  setError: (error: string) => void;
  startMatching: () => void;
}

export const createCallHandlers = ({
  userId,
  sessionId,
  isEndingCall,
  isSkipping,
  stopPolling,
  stopHeartbeat,
  disconnectFromRoom,
  connectToRoom,
  setChatState,
  setSessionId,
  setError,
  startMatching,
}: CallHandlersProps) => {
  const skipCall = async () => {
    if (isEndingCall.current || isSkipping.current) {
      console.log("Already ending/skipping call, skipping duplicate");
      return;
    }

    isSkipping.current = true;
    isEndingCall.current = true;
    stopPolling();
    stopHeartbeat();

    const currentSessionId = sessionId;
    setChatState("WAITING");

    await new Promise((resolve) => setTimeout(resolve, 200));

    if (currentSessionId) {
      try {
        console.log("Skipping call for session:", currentSessionId);
        const skipData = await api.skipCall(userId, currentSessionId);
        console.log("Skip successful:", skipData);

        if (skipData.matchResults?.skipper?.matched && skipData.matchResults.skipper.matchData) {
          console.log("Skip resulted in immediate match!");
          const matchData = skipData.matchResults.skipper.matchData;
          setSessionId(matchData.sessionId);

          const success = await connectToRoom(matchData.roomName);
          if (success) {
            setChatState("IN_CALL");
          }

          setTimeout(() => {
            isEndingCall.current = false;
            isSkipping.current = false;
          }, 100);
          return;
        }

        if (!skipData.queueStatus?.skipperInQueue) {
          console.log("[Skip] Not in queue after skip, manually enqueueing");
          startMatching();
        }
      } catch (err) {
        console.error("Error skipping session:", err);
      }
    }

    setTimeout(() => {
      isEndingCall.current = false;
      isSkipping.current = false;
    }, 100);
  };

  const endCall = async () => {
    if (isEndingCall.current) {
      console.log("Already ending call, skipping duplicate");
      return;
    }

    isEndingCall.current = true;
    stopPolling();
    stopHeartbeat();

    await disconnectFromRoom();
    setChatState("IDLE");

    setTimeout(() => {
      isEndingCall.current = false;
    }, 1000);
  };

  const handleLiveKitDisconnect = async (chatState: string, handleMatch: (matchData: MatchData) => Promise<void>) => {
    console.log("LiveKit disconnected");
    
    if (!isSkipping.current && !isEndingCall.current && chatState === "IN_CALL") {
      console.log("Unexpected disconnection - checking if we were skipped");
      
      try {
        const data = await api.checkDisconnect(userId);
        if (data.shouldDisconnect) {
          console.log("Confirmed: we were skipped");
          
          const matchData = await api.checkMatch(userId);
          if (matchData.matched) {
            console.log("Already matched with someone new!");
            await handleMatch(matchData.data!);
            return;
          }
          
          setChatState("WAITING");
          setError("Skipped by other user - finding new match...");
          
          if (matchData.inQueue) {
            console.log("Already in queue, starting polling");
            stopHeartbeat();
          } else {
            console.log("Not in queue, starting matching");
            setTimeout(() => {
              startMatching();
            }, 500);
          }
          
          setTimeout(() => {
            setError("");
          }, 3000);
          
          return;
        }
      } catch (err) {
        console.error("Error checking disconnect status:", err);
      }
    }
    
    if (!isSkipping.current) {
      await disconnectFromRoom();
      setChatState("IDLE");
      setError("");
    }
  };

  return {
    skipCall,
    endCall,
    handleLiveKitDisconnect,
  };
}; 