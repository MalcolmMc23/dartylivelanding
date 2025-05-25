"use client";

export function QuickActions() {
  const handleFullReset = () => {
    if (
      confirm(
        "Are you sure you want to reset everything? This will clear all queues, matches, and cooldowns."
      )
    ) {
      fetch("/api/debug/reset-system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "full" }),
      }).then(() => window.location.reload());
    }
  };

  const handleClearCooldowns = () => {
    fetch("/api/debug/reset-system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cooldowns" }),
    }).then(() => window.location.reload());
  };

  const handleProcessQueue = () => {
    fetch("/api/trigger-queue-processing", {
      method: "POST",
    }).then(() => alert("Queue processing triggered"));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white p-4 rounded-lg border">
        <h3 className="font-medium mb-2">🔄 Reset Everything</h3>
        <p className="text-sm text-gray-600 mb-3">
          Clear all system state and start fresh. Use this when the system is
          completely stuck.
        </p>
        <button
          onClick={handleFullReset}
          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
        >
          Full Reset
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <h3 className="font-medium mb-2">❄️ Clear Cooldowns</h3>
        <p className="text-sm text-gray-600 mb-3">
          Remove all cooldowns to allow immediate matching between any users.
        </p>
        <button
          onClick={handleClearCooldowns}
          className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600"
        >
          Clear Cooldowns
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <h3 className="font-medium mb-2">🔧 Process Queue</h3>
        <p className="text-sm text-gray-600 mb-3">
          Manually trigger queue processing to attempt matching waiting users.
        </p>
        <button
          onClick={handleProcessQueue}
          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
        >
          Process Queue
        </button>
      </div>
    </div>
  );
}
