"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

interface StyledEmailInputProps {
  placeholder?: string;
  onEmailChange?: (email: string) => void;
}

const StyledEmailInput: React.FC<StyledEmailInputProps> = ({
  placeholder = "Ex. johndoe@exmple.edu",
  onEmailChange,
}) => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    onEmailChange?.(newEmail);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Reset error state
    setError("");

    // Basic validation
    if (!email) {
      setError("Please enter your email");
      return;
    }

    // Check if it's a .edu email
    if (!email.endsWith(".edu")) {
      setError("Please use a valid .edu email address");
      return;
    }

    try {
      setIsSubmitting(true);

      // Make API call to submit email
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit email");
      }

      // Redirect to countdown page with email parameter
      router.push(`/countdown?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError("Something went wrong. Please try again later.");
      console.error(err);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-center w-full max-w-md">
        <input
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder={placeholder}
          className={`w-full px-6 py-3 rounded-full bg-[#2A2A2A] border ${
            error ? "border-red-500" : "border-[#4A4A4A]"
          } text-white placeholder-gray-500 focus:outline-none focus:border-[#A0FF00] focus:ring-1 focus:ring-[#A0FF00] transition-colors duration-200`}
          disabled={isSubmitting}
        />
        <button
          type="submit"
          aria-label="Submit email"
          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-full text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <div className="w-6 h-6 border-2 border-t-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
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
          )}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </form>
  );
};

export default StyledEmailInput;
