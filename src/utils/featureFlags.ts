import { useState, useEffect } from "react";

// Types
export interface MigrationStatus {
  currentSystem: "simple" | "hybrid";
  override: "simple" | "hybrid" | null;
  timestamp: number;
  version: string;
  health: {
    simple: boolean;
    hybrid: boolean;
  };
  simpleQueueUsers: number;
  hybridQueueUsers: number;
  totalUsers: number;
  migrationProgress: number;
}

// Constants
const FEATURE_FLAGS_KEY = "darty_queue_system_override";
const MIGRATION_STATUS_KEY = "darty_migration_status";

// Default migration status
const DEFAULT_MIGRATION_STATUS: MigrationStatus = {
  currentSystem: "hybrid", // Default to hybrid system
  override: null,
  timestamp: Date.now(),
  version: "1.0.0",
  health: {
    simple: true,
    hybrid: true,
  },
  simpleQueueUsers: 0,
  hybridQueueUsers: 0,
  totalUsers: 0,
  migrationProgress: 0,
};

// Queue system override management
export function setQueueSystemOverride(system: "simple" | "hybrid" | null): void {
  try {
    if (system === null) {
      localStorage.removeItem(FEATURE_FLAGS_KEY);
    } else {
      localStorage.setItem(FEATURE_FLAGS_KEY, system);
    }
    
    // Update migration status
    const currentStatus = getMigrationStatus();
    const updatedStatus: MigrationStatus = {
      ...currentStatus,
      override: system,
      currentSystem: system || currentStatus.currentSystem,
      timestamp: Date.now(),
    };
    
    localStorage.setItem(MIGRATION_STATUS_KEY, JSON.stringify(updatedStatus));
    
    // Trigger a page reload to apply the changes
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  } catch (error) {
    console.error("Error setting queue system override:", error);
  }
}

export function getQueueSystemOverride(): "simple" | "hybrid" | null {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(FEATURE_FLAGS_KEY) as "simple" | "hybrid" | null;
  } catch (error) {
    console.error("Error getting queue system override:", error);
    return null;
  }
}

// Migration status management
export function getMigrationStatus(): MigrationStatus {
  try {
    if (typeof window === "undefined") return DEFAULT_MIGRATION_STATUS;
    
    const stored = localStorage.getItem(MIGRATION_STATUS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_MIGRATION_STATUS, ...parsed };
    }
    
    return DEFAULT_MIGRATION_STATUS;
  } catch (error) {
    console.error("Error getting migration status:", error);
    return DEFAULT_MIGRATION_STATUS;
  }
}

export function setMigrationStatus(status: Partial<MigrationStatus>): void {
  try {
    if (typeof window === "undefined") return;
    
    const currentStatus = getMigrationStatus();
    const updatedStatus: MigrationStatus = {
      ...currentStatus,
      ...status,
      timestamp: Date.now(),
    };
    
    localStorage.setItem(MIGRATION_STATUS_KEY, JSON.stringify(updatedStatus));
  } catch (error) {
    console.error("Error setting migration status:", error);
  }
}

// React hook to determine which queue system to use
export function useSimpleQueue(): boolean {
  const [useSimple, setUseSimple] = useState<boolean>(false);
  
  useEffect(() => {
    const override = getQueueSystemOverride();
    const migrationStatus = getMigrationStatus();
    
    if (override) {
      setUseSimple(override === "simple");
    } else {
      // Use the current system from migration status
      setUseSimple(migrationStatus.currentSystem === "simple");
    }
  }, []);
  
  return useSimple;
}

// Utility function to check if we're in migration mode
export function isInMigrationMode(): boolean {
  const status = getMigrationStatus();
  return status.override !== null;
}

// Function to reset all feature flags
export function resetFeatureFlags(): void {
  try {
    if (typeof window === "undefined") return;
    
    localStorage.removeItem(FEATURE_FLAGS_KEY);
    localStorage.removeItem(MIGRATION_STATUS_KEY);
    
    // Reload the page to apply changes
    window.location.reload();
  } catch (error) {
    console.error("Error resetting feature flags:", error);
  }
}

// Function to get feature flag info for debugging
export function getFeatureFlagInfo() {
  return {
    override: getQueueSystemOverride(),
    migrationStatus: getMigrationStatus(),
    isInMigrationMode: isInMigrationMode(),
  };
} 