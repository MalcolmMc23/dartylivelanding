import { AloneUserTester } from "@/components/debug/AloneUserTester";

export default function AloneUsersDebugPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Alone Users Debug Page
        </h1>

        <div className="mb-8">
          <p className="text-gray-600 mb-4">
            This page helps debug the alone user management system. Users who
            are alone in rooms for more than 5 seconds should be automatically
            reset and put back into the queue.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">How it works:</h3>
            <ul className="text-blue-700 space-y-1 text-sm">
              <li>
                • When a user is alone in a room, they are tracked with a
                timestamp
              </li>
              <li>
                • After 5 seconds alone, they are automatically reset and put
                back in the queue
              </li>
              <li>
                • The background processor checks every 2 seconds for users to
                reset
              </li>
              <li>
                • Users are removed from room tracking and active matches when
                reset
              </li>
            </ul>
          </div>
        </div>

        <AloneUserTester />
      </div>
    </div>
  );
}
