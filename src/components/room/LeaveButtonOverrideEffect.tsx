"use client";

import { useEffect } from "react";

interface LeaveButtonOverrideEffectProps {
  onLeaveButtonClick: () => void;
}

export function LeaveButtonOverrideEffect({
  onLeaveButtonClick,
}: LeaveButtonOverrideEffectProps) {
  useEffect(() => {
    // Keep track of added event listeners to avoid duplicates
    const processedButtons = new Set();

    // Handler function to be added to the leave/disconnect button
    const handleClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Leave button clicked, returning to search screen");
      onLeaveButtonClick();
    };

    // Function to check and attach listeners
    const attachListeners = () => {
      // Check for leave buttons with more specific selectors
      const leaveButtons = document.querySelectorAll(
        '.lk-disconnect-button, .lk-leave-button, button[aria-label="Leave call"], button[aria-label="Disconnect"], button[title="Leave"], button[title="Disconnect"]'
      );
      console.log(`Found ${leaveButtons.length} leave/disconnect buttons`);

      leaveButtons.forEach((button) => {
        if (!processedButtons.has(button)) {
          console.log("Found leave button, attaching click handler", button);
          button.addEventListener("click", handleClick);
          processedButtons.add(button);
        }
      });
    };

    // Set up a MutationObserver to watch for the button to be added to the DOM
    const observer = new MutationObserver(() => {
      attachListeners();
    });

    // Start observing the document body for DOM changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial check
    attachListeners();

    // Set a periodic check as a fallback
    const intervalId = setInterval(attachListeners, 1000);

    // Clean up event listeners and observer when component unmounts
    return () => {
      clearInterval(intervalId);
      observer.disconnect();
      processedButtons.forEach((button) => {
        (button as Element).removeEventListener("click", handleClick);
      });
    };
  }, [onLeaveButtonClick]);

  return null; // This component doesn't render anything
}
