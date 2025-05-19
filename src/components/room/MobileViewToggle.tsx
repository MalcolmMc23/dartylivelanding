"use client";

interface MobileViewToggleProps {
  mobileView: "video" | "chat";
  setMobileView: (view: "video" | "chat") => void;
}

export function MobileViewToggle({ mobileView, setMobileView }: MobileViewToggleProps) {
  return (
    <div className="md:hidden flex justify-center p-2 bg-[#1A1A1A] border-b border-[#2A2A2A]">
      <div className="inline-flex rounded-md shadow-sm" role="group">
        <button
          onClick={() => setMobileView("video")}
          className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
            mobileView === "video"
              ? "bg-[#A0FF00] text-black"
              : "bg-[#2A2A2A] text-white hover:bg-[#3A3A3A]"
          }`}
        >
          Video
        </button>
        <button
          onClick={() => setMobileView("chat")}
          className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
            mobileView === "chat"
              ? "bg-[#A0FF00] text-black"
              : "bg-[#2A2A2A] text-white hover:bg-[#3A3A3A]"
          }`}
        >
          Chat
        </button>
      </div>
    </div>
  );
} 