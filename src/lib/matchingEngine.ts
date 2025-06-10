import { matchingQueueManager } from './matchingQueue';
import { cooldownManager } from './cooldownManager';
import { matchManager, MatchCreationResult } from './matchManager';
import { UserStateEntry } from './stateManager';

// Configuration interface for the matching engine
export interface MatchingEngineConfig {
  batchSize: number;
  processingIntervalMs: number;
  maxConcurrentMatches: number;
  cooldownCheckBatchSize: number;
  enableBackpressure: boolean;
  backpressureThreshold: number;
}

// Default configuration
const DEFAULT_CONFIG: MatchingEngineConfig = {
  batchSize: 50,
  processingIntervalMs: 1000,
  maxConcurrentMatches: 25,
  cooldownCheckBatchSize: 100,
  enableBackpressure: true,
  backpressureThreshold: 1000
};

// Batch processing result
export interface BatchProcessingResult {
  totalUsersProcessed: number;
  matchesCreated: number;
  matchesFailed: number;
  usersSkippedDueToCooldown: number;
  processingTimeMs: number;
  queueSizeAfter: number;
  backpressureTriggered: boolean;
}

// Match attempt result
interface MatchAttempt {
  user1: string;
  user2: string;
  success: boolean;
  reason?: string;
  inCooldown?: boolean;
}

// Monitoring metrics
export interface MatchingMetrics {
  totalMatchesProcessed: number;
  totalMatchesCreated: number;
  totalMatchesFailed: number;
  averageProcessingTimeMs: number;
  currentQueueSize: number;
  lastProcessedAt: number;
  backpressureEvents: number;
}

/**
 * High-performance batch processing matching engine
 */
export class MatchingEngine {
  private config: MatchingEngineConfig;
  private metrics: MatchingMetrics;
  private isProcessing: boolean = false;
  private processingInterval?: NodeJS.Timeout;

  constructor(config: Partial<MatchingEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalMatchesProcessed: 0,
      totalMatchesCreated: 0,
      totalMatchesFailed: 0,
      averageProcessingTimeMs: 0,
      currentQueueSize: 0,
      lastProcessedAt: 0,
      backpressureEvents: 0
    };
  }

  /**
   * Start the automatic batch processing
   */
  start(): void {
    if (this.processingInterval) {
      console.warn('[MatchingEngine] Engine is already running');
      return;
    }

    console.log(`[MatchingEngine] Starting with config:`, this.config);
    
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processMatches();
      }
    }, this.config.processingIntervalMs);
  }

  /**
   * Stop the automatic batch processing
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
      console.log('[MatchingEngine] Stopped');
    }
  }

  /**
   * Process a batch of matches
   */
  async processMatches(): Promise<BatchProcessingResult> {
    if (this.isProcessing) {
      console.warn('[MatchingEngine] Already processing, skipping this cycle');
      return this.createEmptyResult();
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Check current queue size
      const queueSize = await matchingQueueManager.getQueueSize();
      this.metrics.currentQueueSize = queueSize;

      // Handle backpressure
      if (this.config.enableBackpressure && queueSize > this.config.backpressureThreshold) {
        console.warn(`[MatchingEngine] Backpressure triggered: queue size ${queueSize} > threshold ${this.config.backpressureThreshold}`);
        this.metrics.backpressureEvents++;
        
        // Increase batch size temporarily to handle the load
        const adjustedBatchSize = Math.min(this.config.batchSize * 2, queueSize);
        return await this.processBatch(adjustedBatchSize, true);
      }

      // Normal processing
      return await this.processBatch(this.config.batchSize, false);

    } finally {
      this.isProcessing = false;
      this.metrics.lastProcessedAt = Date.now();
      
      // Update average processing time
      const processingTime = Date.now() - startTime;
      this.updateAverageProcessingTime(processingTime);
    }
  }

  /**
   * Process a specific batch size
   */
  private async processBatch(batchSize: number, backpressureMode: boolean): Promise<BatchProcessingResult> {
    const startTime = Date.now();

    try {
      // Get users from the queue
      const waitingUsers = await matchingQueueManager.getNextUsers(batchSize);
      
      if (waitingUsers.length < 2) {
        console.log(`[MatchingEngine] Insufficient users in queue: ${waitingUsers.length}`);
        return this.createEmptyResult();
      }

      console.log(`[MatchingEngine] Processing ${waitingUsers.length} users (backpressure: ${backpressureMode})`);

      // Generate potential pairs
      const potentialPairs = this.generatePairs(waitingUsers);
      
      if (potentialPairs.length === 0) {
        console.log('[MatchingEngine] No pairs could be generated');
        return this.createEmptyResult();
      }

      // Check cooldowns in batch
      const cooldownResults = await this.checkCooldownsInBatch(potentialPairs);

      // Filter out pairs in cooldown
      const validPairs = potentialPairs.filter((_, index) => !cooldownResults[index]);
      
      if (validPairs.length === 0) {
        console.log('[MatchingEngine] All potential pairs are in cooldown');
        return {
          totalUsersProcessed: waitingUsers.length,
          matchesCreated: 0,
          matchesFailed: 0,
          usersSkippedDueToCooldown: potentialPairs.length * 2,
          processingTimeMs: Date.now() - startTime,
          queueSizeAfter: await matchingQueueManager.getQueueSize(),
          backpressureTriggered: backpressureMode
        };
      }

      // Create matches for valid pairs
      const matchAttempts = await this.createMatchesInBatch(validPairs);

      // Calculate results
      const result = this.calculateBatchResult(
        waitingUsers.length,
        matchAttempts,
        potentialPairs.length - validPairs.length,
        startTime,
        backpressureMode
      );

      // Update metrics
      this.updateMetrics(result);

      console.log(`[MatchingEngine] Batch complete: ${result.matchesCreated} matches created, ${result.matchesFailed} failed`);
      
      return result;

    } catch (error) {
      console.error('[MatchingEngine] Error during batch processing:', error);
      return this.createEmptyResult();
    }
  }

  /**
   * Generate pairs from a list of users
   */
  private generatePairs(users: UserStateEntry[]): [string, string][] {
    const pairs: [string, string][] = [];
    
    // Simple pairing: take users in order
    for (let i = 0; i < users.length - 1; i += 2) {
      pairs.push([users[i].userId, users[i + 1].userId]);
    }

    return pairs;
  }

  /**
   * Check cooldowns for multiple pairs in batch
   */
  private async checkCooldownsInBatch(pairs: [string, string][]): Promise<boolean[]> {
    try {
      const cooldownStatus = await cooldownManager.checkMultiplePairs(pairs);
      
      // Convert the cooldown status object to a boolean array
      return pairs.map(pair => {
        const key = this.createCooldownKey(pair[0], pair[1]);
        return cooldownStatus[key] || false;
      });
    } catch (error) {
      console.error('[MatchingEngine] Error checking cooldowns:', error);
      // If cooldown check fails, assume all pairs are valid to avoid blocking
      return pairs.map(() => false);
    }
  }

  /**
   * Create a cooldown key (same logic as CooldownManager)
   */
  private createCooldownKey(userId1: string, userId2: string): string {
    const sortedIds = [userId1, userId2].sort();
    return `cooldown:${sortedIds[0]}:${sortedIds[1]}`;
  }

  /**
   * Create matches for valid pairs in batch
   */
  private async createMatchesInBatch(pairs: [string, string][]): Promise<MatchAttempt[]> {
    const matchPromises = pairs.map(async ([user1, user2]): Promise<MatchAttempt> => {
      try {
        const result = await matchManager.createMatch(user1, user2);
        
        return {
          user1,
          user2,
          success: result.success,
          reason: result.error || undefined
        };
      } catch (error) {
        console.error(`[MatchingEngine] Error creating match for ${user1} and ${user2}:`, error);
        return {
          user1,
          user2,
          success: false,
          reason: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    // Process matches with concurrency limit
    const results: MatchAttempt[] = [];
    const concurrencyLimit = this.config.maxConcurrentMatches;
    
    for (let i = 0; i < matchPromises.length; i += concurrencyLimit) {
      const batch = matchPromises.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Calculate the final batch result
   */
  private calculateBatchResult(
    totalUsers: number,
    matchAttempts: MatchAttempt[],
    usersSkippedDueToCooldown: number,
    startTime: number,
    backpressureTriggered: boolean
  ): BatchProcessingResult {
    const matchesCreated = matchAttempts.filter(attempt => attempt.success).length;
    const matchesFailed = matchAttempts.filter(attempt => !attempt.success).length;

    return {
      totalUsersProcessed: totalUsers,
      matchesCreated,
      matchesFailed,
      usersSkippedDueToCooldown,
      processingTimeMs: Date.now() - startTime,
      queueSizeAfter: 0, // Will be updated by caller
      backpressureTriggered
    };
  }

  /**
   * Update internal metrics
   */
  private updateMetrics(result: BatchProcessingResult): void {
    this.metrics.totalMatchesProcessed += result.totalUsersProcessed;
    this.metrics.totalMatchesCreated += result.matchesCreated;
    this.metrics.totalMatchesFailed += result.matchesFailed;
  }

  /**
   * Update average processing time using exponential moving average
   */
  private updateAverageProcessingTime(newTime: number): void {
    if (this.metrics.averageProcessingTimeMs === 0) {
      this.metrics.averageProcessingTimeMs = newTime;
    } else {
      // Use exponential moving average with alpha = 0.1
      this.metrics.averageProcessingTimeMs = 
        0.9 * this.metrics.averageProcessingTimeMs + 0.1 * newTime;
    }
  }

  /**
   * Create an empty result for cases where no processing occurred
   */
  private createEmptyResult(): BatchProcessingResult {
    return {
      totalUsersProcessed: 0,
      matchesCreated: 0,
      matchesFailed: 0,
      usersSkippedDueToCooldown: 0,
      processingTimeMs: 0,
      queueSizeAfter: 0,
      backpressureTriggered: false
    };
  }

  /**
   * Get current metrics
   */
  getMetrics(): MatchingMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MatchingEngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[MatchingEngine] Configuration updated:', this.config);
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalMatchesProcessed: 0,
      totalMatchesCreated: 0,
      totalMatchesFailed: 0,
      averageProcessingTimeMs: 0,
      currentQueueSize: 0,
      lastProcessedAt: 0,
      backpressureEvents: 0
    };
    console.log('[MatchingEngine] Metrics reset');
  }
}

// Export singleton instance
export const matchingEngine = new MatchingEngine(); 