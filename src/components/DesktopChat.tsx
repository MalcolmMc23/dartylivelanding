import { useState, useRef, useEffect } from "react";
import { useRoomContext } from "@livekit/components-react";
import { DataPacket_Kind, RemoteParticipant, RoomEvent } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Message {
  id: string;
  sender: string;
  text: string;
  isLocal: boolean;
}

interface DesktopChatProps {
  username: string;
  onNewMessage?: () => void;
}

function useIsNarrowChat() {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    function handleResize() {
      setIsNarrow(window.innerWidth < 1425);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isNarrow;
}

export function DesktopChat({ username, onNewMessage }: DesktopChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const room = useRoomContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Add this line
  const isNarrow = useIsNarrowChat();

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set up data channel listeners
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      kind?: DataPacket_Kind
    ) => {
      if (kind !== DataPacket_Kind.RELIABLE) return;
      try {
        const dataString = new TextDecoder().decode(payload);
        const data = JSON.parse(dataString);
        if (data.type === "chat") {
          const newMessage: Message = {
            id: data.id,
            sender: data.sender,
            text: data.text,
            isLocal: false,
          };
          setMessages((prev) => [...prev, newMessage]);
          if (data.sender !== username && onNewMessage) {
            onNewMessage();
          }
        }
      } catch (e) {
        console.error("Error parsing data message:", e);
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, username, onNewMessage]);

  const handleSendMessage = () => {
    if (inputValue.trim() === "" || !room) return;
    const messageId = Date.now().toString();
    const newMessage: Message = {
      id: messageId,
      sender: username,
      text: inputValue,
      isLocal: true,
    };
    setMessages((prev) => [...prev, newMessage]);
    setInputValue("");
    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    try {
      const data = {
        type: "chat",
        id: messageId,
        sender: username,
        text: inputValue,
      };
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(JSON.stringify(data));
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
    <div
      className={`
        flex flex-col desktop-chat
        ${isNarrow
          ? "w-[270px] h-[40vh] right-2"
          : "w-[350px] h-[55vh] right-8"}
        max-w-[90vw]
        bg-[#18122B] rounded-2xl shadow-2xl border-4 border-transparent
        [background:linear-gradient(#18122B,#18122B),linear-gradient(135deg,#a259ff,#6a1b9a,#231942)]
        [background-origin:border-box] [background-clip:padding-box,border-box]
        fixed top-1/2 -translate-y-1/2 z-40
      `}
      style={{ ...(isNarrow ? { right: '0.5rem' } : { right: '2rem' }) }}
    >
      <div className="border-b border-[#2D1950] px-6 py-4 bg-[#A259FF] rounded-t-2xl">
        <div className="text-lg font-semibold text-white tracking-wide">Chat</div>
      </div>
      <div className="flex flex-col px-6 py-4 gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar bg-[#18122B] flex-1">
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
      <div className="border-t border-[#2D1950] px-6 py-4 bg-[#1E1533] rounded-b-2xl">
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
              ref={textareaRef} // Add this line
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
            className="font-bold bg-gradient-to-br from-[#A259FF] to-[#6A1B9A] text-white hover:cursor-pointer hover:from-[#B983FF] hover:to-[#7C3AED] border-none shadow-lg"
          >
            Send
          </Button>
        </form>
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
        
        }
      `}</style>
    </div>
  );
}