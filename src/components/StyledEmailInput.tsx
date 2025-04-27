import React from "react";

interface StyledEmailInputProps {
  placeholder?: string;
}

const StyledEmailInput: React.FC<StyledEmailInputProps> = ({
  placeholder = "Ex. johndoe@exmpl.edu",
}) => {
  return (
    <div className="relative flex items-center w-full max-w-md">
      <input
        type="email"
        placeholder={placeholder}
        className="w-full px-6 py-3 rounded-full bg-[#2A2A2A] border border-[#4A4A4A] text-white placeholder-gray-500 focus:outline-none focus:border-[#A0FF00] focus:ring-1 focus:ring-[#A0FF00] transition-colors duration-200"
      />
      <button
        type="button" // Change to "submit" if this becomes part of a form
        aria-label="Submit email"
        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-full text-gray-400 hover:text-white transition-colors"
      >
        {/* Simple SVG arrow */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
          />
        </svg>
      </button>
    </div>
  );
};

export default StyledEmailInput;
