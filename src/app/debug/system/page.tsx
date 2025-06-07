import { SystemResetDebugger } from "@/components/debug/SystemResetDebugger";
import { CooldownDebugger } from "@/components/debug/CooldownDebugger";

export default function SystemDebugPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          System Debug Dashboard
        </h1>

        <div className="mb-8">
          <p className="text-gray-600 mb-4">
            This page provides debugging tools for the matching system. Use
            these tools to diagnose and fix issues with user matching,
            cooldowns, and system state.
          </p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-800 mb-2">
              Common Issues & Solutions:
            </h3>
            <ul className="text-yellow-700 space-y-1 text-sm">
              <li>
                • <strong>Users stuck in queue:</strong> Clear cooldowns or
                reset the queue
              </li>
              <li>
                • <strong>LiveKit connection issues:</strong> Check environment
                variables and use demo mode
              </li>
              <li>
                • <strong>Users alone in rooms:</strong> The alone user
                processor should handle this automatically
              </li>
              <li>
                • <strong>Matches not working:</strong> Try a full system reset
              </li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* System Reset Tools */}
          <div>
            <h2 className="text-xl font-semibold mb-4">System Reset Tools</h2>
            <SystemResetDebugger />
          </div>

          {/* Cooldown Debugger */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Cooldown Management</h2>
            <CooldownDebugger username="debug-user" />
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
              <p>
                <strong>Note:</strong> Enter any username to see their
                cooldowns. You can also set test cooldowns between users.
              </p>
            </div>
          </div>
        </div>

        {/* Environment Info */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">
            Environment Information
          </h2>
          <div className="bg-white p-4 rounded-lg border">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">LiveKit Configuration</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>
                    • API Key:{" "}
                    {process.env.LIVEKIT_API_KEY ? "✅ Set" : "❌ Missing"}
                  </li>
                  <li>
                    • API Secret:{" "}
                    {process.env.LIVEKIT_API_SECRET ? "✅ Set" : "❌ Missing"}
                  </li>
                  <li>
                    • Host:{" "}
                    {process.env.LIVEKIT_HOST ||
                      process.env.NEXT_PUBLIC_LIVEKIT_URL ||
                      "❌ Missing"}
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Redis Configuration</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>
                    • Redis URL:{" "}
                    {process.env.REDIS_URL ? "✅ Set" : "❌ Missing"}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
