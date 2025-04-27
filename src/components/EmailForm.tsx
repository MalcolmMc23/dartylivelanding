"use client";

import React, { useState } from "react";

export default function EmailForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(""); // To display feedback
  const [isLoading, setIsLoading] = useState(false); // To show loading state
  const [isError, setIsError] = useState(false); // To indicate error

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent default form submission
    setIsLoading(true);
    setMessage(""); // Clear previous messages
    setIsError(false);

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle errors from the API route
        throw new Error(data.message || `Error: ${response.status}`);
      }

      // Success
      setMessage(data.message || "Subscription successful!");
      setEmail(""); // Clear the input field on success
    } catch (error) {
      console.error("Submission Error:", error);
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "An unknown error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 items-start">
      <div className="flex gap-2 w-full">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
          disabled={isLoading} // Disable input while loading
          className="border p-2 rounded flex-grow disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading} // Disable button while loading
          className="bg-blue-500 text-white p-2 rounded disabled:bg-gray-400"
        >
          {isLoading ? "Submitting..." : "Submit"}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${isError ? "text-red-500" : "text-green-500"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
