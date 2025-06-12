interface DebugButtonsProps {
  onCheckStatus: () => void;
  onForceCleanup: () => void;
}

export function DebugButtons({ onCheckStatus, onForceCleanup }: DebugButtonsProps) {
  return (
    <div className="flex gap-2 justify-center">
      <button
        onClick={onCheckStatus}
        className="text-xs text-gray-400 underline hover:cursor-pointer"
      >
        Check Status
      </button>
      <button
        onClick={onForceCleanup}
        className="text-xs text-gray-400 underline hover:cursor-pointer"
      >
        Force Cleanup
      </button>
    </div>
  );
} 