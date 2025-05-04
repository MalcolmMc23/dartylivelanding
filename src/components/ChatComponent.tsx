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
    <div className="flex flex-col h-full bg-[#121212] border-l border-[#2A2A2A]">
      <div className="p-3 border-b border-[#2A2A2A] bg-[#1A1A1A]">
        <h2 className="text-lg font-medium text-white">Chat</h2>
      </div>

      <div className="flex-grow overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
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
              className={`mb-3 ${message.isLocal ? "text-right" : "text-left"}`}
            >
              <div
                className={`inline-block px-4 py-2 rounded-lg max-w-[80%] break-words ${
                  message.isLocal
                    ? "bg-[#A0FF00] text-black"
                    : "bg-[#2A2A2A] text-white"
                }`}
              >
                <p className="text-sm font-medium mb-1">
                  {message.isLocal ? "You" : message.sender}
                </p>
                <p>{message.text}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-[#2A2A2A] bg-[#1A1A1A]">
        <div className="flex">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a message..."
            className="flex-grow mr-2 p-2 rounded bg-[#2A2A2A] text-white resize-none min-h-[40px] max-h-[120px]"
            rows={1}
          />
          <button
            onClick={handleSendMessage}
            disabled={inputValue.trim() === ""}
            className="px-4 py-2 bg-[#A0FF00] text-black rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
