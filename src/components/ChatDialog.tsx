import { useState, useRef, useEffect } from "react";
import { useRoomContext } from "@livekit/components-react";
import { DataPacket_Kind, RemoteParticipant, RoomEvent } from "livekit-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Message {
  id: string;
  sender: string;
  text: string;
  isLocal: boolean;
}

interface ChatDialogProps {
  username: string;
  isOpen: boolean;
  onClose: () => void;
  onNewMessage?: () => void; // NEW PROP
}

export function ChatDialog({ username, isOpen, onClose, onNewMessage }: ChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const room = useRoomContext();
  

  // Scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Set up data channel listeners
  useEffect(() => {
    if (!room) return;

    // Handle received data messages
    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      kind?: DataPacket_Kind
    ) => {
      // Only handle reliable data channel messages
      if (kind !== DataPacket_Kind.RELIABLE) return;

      try {
        // Parse the message data
        const dataString = new TextDecoder().decode(payload);
        const data = JSON.parse(dataString);

        // Check if it's a chat message
        if (data.type === "chat") {
          const newMessage: Message = {
            id: data.id,
            sender: data.sender,
            text: data.text,
            isLocal: false,
          };

          setMessages((prevMessages) => [...prevMessages, newMessage]);
          // Notify parent if message is from someone else
          if (data.sender !== username && onNewMessage) {
            onNewMessage();
          }
        }
      } catch (e) {
        console.error("Error parsing data message:", e);
      }
    };

    // Listen for data messages
    room.on(RoomEvent.DataReceived, handleDataReceived);

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  const handleSendMessage = () => {
    if (inputValue.trim() === "" || !room) return;

    const messageId = Date.now().toString();

    // Create the message object
    const newMessage: Message = {
      id: messageId,
      sender: username,
      text: inputValue,
      isLocal: true,
    };

    // Add to local state
    setMessages((prevMessages) => [...prevMessages, newMessage]);
    setInputValue("");

    // Send the message via data channel
    try {
      const data = {
        type: "chat",
        id: messageId,
        sender: username,
        text: inputValue,
      };

      const encoder = new TextEncoder();
      const encodedData = encoder.encode(JSON.stringify(data));

      // Send to all participants with reliable delivery
      room.localParticipant.publishData(encodedData, { reliable: true });
    } catch (e) {
      console.error("Error sending message:", e);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open ? onClose() : undefined}>
      <DialogContent 
        className="
          max-w-lg 
          p-0 
          bg-[#18122B] 
          rounded-2xl 
          shadow-2xl 
          border-4 
          border-transparent 
          [background:linear-gradient(#18122B,#18122B),linear-gradient(135deg,#a259ff,#6a1b9a,#231942)] 
          [background-origin:border-box] 
          [background-clip:padding-box,border-box]
        "
      >
        <DialogHeader className="border-b border-[#2D1950] px-6 py-4 bg-[#A259FF]">
          <DialogTitle className="text-lg font-semibold text-white tracking-wide">
            Chat
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col px-6 py-4 gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar bg-[#18122B]">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-[#B39DDB] text-center">
              <p>No messages yet.<br />Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isLocal ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`px-4 py-2 rounded-xl max-w-[75%] break-words shadow-sm
                    ${message.isLocal
                      ? "bg-gradient-to-br from-[#A259FF] to-[#6A1B9A] text-white"
                      : "bg-[#231942] text-[#E0C3FC] border border-[#2D1950]"}`}
                >
                  <p className="text-xs font-medium mb-1 opacity-70">
                    {message.isLocal ? "You" : message.sender}
                  </p>
                  <p className="text-sm">{message.text}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <DialogFooter className="border-t border-[#2D1950] px-6 py-4 bg-[#1E1533]">
          <form
            className="flex w-full gap-2 items-end"
            style={{ maxWidth: "100%" }}
            onSubmit={e => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <div className="flex-1 min-w-0">
              <Textarea
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type a message..."
                className="
                  w-full 
                  max-w-full 
                  resize-y 
                  min-h-[44px] 
                  max-h-[120px] 
                  font-medium 
                  bg-[#231942] 
                  text-white 
                  placeholder-[#B39DDB] 
                  border-none 
                  focus:ring-2 
                  focus:ring-[#A259FF]
                  resize-vertical
                "
                rows={1}
                style={{ overflow: 'hidden', resize: 'vertical' }}
                onInput={e => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 120) + "px";
                }}
              />
            </div>
            <Button
              type="submit"
              disabled={inputValue.trim() === ""}
              className="font-bold bg-gradient-to-br from-[#A259FF] to-[#6A1B9A] text-white hover:from-[#B983FF] hover:to-[#7C3AED] border-none shadow-lg"
            >
              Send
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3a1857;
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </Dialog>
  );
}