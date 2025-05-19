"use client";

import { useState, useRef, useEffect } from "react";
import { useRoomContext } from "@livekit/components-react";
import { DataPacket_Kind, RemoteParticipant, RoomEvent } from "livekit-client";

interface Message {
  id: string;
  sender: string;
  text: string;
  isLocal: boolean;
}

interface ChatComponentProps {
  username: string;
  roomName: string;
}

export function ChatComponent({ username, roomName }: ChatComponentProps) {
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
        }
      } catch (e) {
        console.error("Error parsing data message:", e);
      }
    };

    // Listen for data messages
    room.on(RoomEvent.DataReceived, handleDataReceived);

    // Log room name for debugging
    console.log(`Chat initialized in room: ${roomName}`);

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, roomName]);

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

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
      <div className="relative w-full max-w-sm min-w-[320px] flex flex-col bg-white/10 backdrop-blur-lg border border-[#3a1857] rounded-2xl shadow-2xl pointer-events-auto"
           style={{ maxHeight: '70vh' }}>
        <div className="p-4 border-b border-[#3a1857] bg-gradient-to-r from-[#2a1857] to-[#3a1857] rounded-t-2xl">
          <h2 className="text-xl font-bold text-white tracking-wide">Chat</h2>
        </div>

        <div className="flex-grow overflow-y-auto px-5 py-4 custom-scrollbar"
             style={{ maxHeight: '40vh' }}>
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#b39ddb] text-center p-4">
              <p>
                No messages yet.
                <br />
                Start the conversation!
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`mb-4 flex ${message.isLocal ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`px-5 py-3 rounded-2xl max-w-[75%] break-words shadow-md transition-all
                    ${message.isLocal
                      ? "bg-gradient-to-br from-[#a259ff] to-[#6a1b9a] text-white"
                      : "bg-[#22153a]/80 text-[#e1bee7] border border-[#3a1857]"}`}
                >
                  <p className="text-xs font-semibold mb-1 opacity-80 tracking-wide">
                    {message.isLocal ? "You" : message.sender}
                  </p>
                  <p className="text-base leading-relaxed">{message.text}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-[#3a1857] bg-gradient-to-r from-[#2a1857] to-[#3a1857] rounded-b-2xl">
          <div className="flex gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type a message..."
              className="flex-grow p-3 rounded-xl bg-[#22153a]/70 text-white placeholder-[#b39ddb] focus:outline-none focus:ring-2 focus:ring-[#a259ff] resize-none min-h-[44px] max-h-[120px] font-medium transition-all overflow-hidden hide-scrollbar"
              rows={1}
              style={{ overflow: 'hidden' }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={inputValue.trim() === ""}
              className="px-5 py-2 bg-gradient-to-br from-[#a259ff] to-[#6a1b9a] text-white rounded-xl font-bold shadow-lg hover:cursor-pointer hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
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
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
      `}</style>
    </div>
  );
}
