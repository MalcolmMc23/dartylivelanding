import { api } from "../utils/api";
import { ChatState } from "../types";

interface DebugHandlersProps {
  userId: string;
  setChatState: (state: ChatState) => void;
  setSessionId: (id: string) => void;
}

export const createDebugHandlers = ({
  userId,
  setChatState,
  setSessionId,
}: DebugHandlersProps) => {
  const handleCheckStatus = async () => {
    if (!userId) return;
    const data = await api.checkMatch(userId);
    console.log("Manual check result:", data);
  };

  const handleForceCleanup = async () => {
    if (!userId) return;
    const data = await api.forceCleanup(userId);
    console.log("Force cleanup result:", data);
    if (data.allClean) {
      setChatState("IDLE");
      setSessionId("");
    }
  };

  return {
    handleCheckStatus,
    handleForceCleanup,
  };
}; 