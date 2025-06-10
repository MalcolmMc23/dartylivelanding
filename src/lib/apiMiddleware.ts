import { NextRequest, NextResponse } from 'next/server';
import { userMetadataManager } from './userMetadata';
import { stateManager, UserState, USER_STATES } from './stateManager';
import { stateTransitionManager } from './stateTransitions';

// Types for middleware configuration
export interface ApiEndpointConfig {
  endpoint: string;
  requiredStates?: UserState[];
  forbiddenStates?: UserState[];
  allowedMethods?: string[];
  requiresAuth?: boolean;
  skipStateValidation?: boolean;
  customValidation?: (userId: string, currentState: UserState | null, metadata: any) => Promise<boolean>;
}

// Types for logging and analytics
export interface ApiRequestLog {
  requestId: string;
  endpoint: string;
  method: string;
  userId?: string;
  userState?: UserState | null;
  timestamp: number;
  duration?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsEvent {
  eventType: 'api_request' | 'state_validation' | 'user_action' | 'system_event';
  userId?: string;
  endpoint?: string;
  action?: string;
  state?: UserState;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

// Centralized endpoint configurations
const ENDPOINT_CONFIGS: Record<string, ApiEndpointConfig> = {
  '/api/simple-matching/enqueue': {
    endpoint: '/api/simple-matching/enqueue',
    requiresAuth: true,
    allowedMethods: ['POST'],
    // User can be IDLE (first time) or WAITING (for re-queue with grace)
    requiredStates: [USER_STATES.IDLE, USER_STATES.WAITING],
  },
  '/api/simple-matching/skip': {
    endpoint: '/api/simple-matching/skip',
    requiresAuth: true,
    allowedMethods: ['POST'],
    requiredStates: [USER_STATES.IN_CALL],
  },
  '/api/simple-matching/end': {
    endpoint: '/api/simple-matching/end',
    requiresAuth: true,
    allowedMethods: ['POST'],
    requiredStates: [USER_STATES.IN_CALL],
  },
  '/api/simple-matching/heartbeat': {
    endpoint: '/api/simple-matching/heartbeat',
    requiresAuth: true,
    allowedMethods: ['POST'],
    skipStateValidation: true, // Heartbeat can happen in any state
  },
  '/api/simple-matching/check-match': {
    endpoint: '/api/simple-matching/check-match',
    requiresAuth: true,
    allowedMethods: ['GET'],
    // This endpoint is for users waiting for a match
    requiredStates: [USER_STATES.WAITING, USER_STATES.CONNECTING],
  },
  '/api/simple-matching/check-disconnect': {
    endpoint: '/api/simple-matching/check-disconnect',
    requiresAuth: true,
    allowedMethods: ['GET'],
    // Can be checked in-call or while connecting
    requiredStates: [USER_STATES.IN_CALL, USER_STATES.CONNECTING, USER_STATES.DISCONNECTING],
  },
};

/**
 * API Middleware and Logging Manager
 * Provides centralized state validation, logging, and analytics for API endpoints
 */
export class ApiMiddlewareManager {
  private static instance: ApiMiddlewareManager;
  private requestLogs: Map<string, ApiRequestLog> = new Map();
  private analyticsEvents: AnalyticsEvent[] = [];
  private maxLogRetention = 1000; // Keep last 1000 requests
  private maxAnalyticsRetention = 5000; // Keep last 5000 events

  private constructor() {
    this.initializeEventListeners();
  }

  /**
   * Singleton pattern implementation
   */
  public static getInstance(): ApiMiddlewareManager {
    if (!ApiMiddlewareManager.instance) {
      ApiMiddlewareManager.instance = new ApiMiddlewareManager();
    }
    return ApiMiddlewareManager.instance;
  }

  /**
   * Initialize event listeners for state transitions
   */
  private initializeEventListeners(): void {
    // Listen for state transitions to log analytics events
    stateTransitionManager.onTransition(async (event) => {
      // Type guard to ensure we have a StateTransitionEvent (not StateTransitionError)
      if (!('error' in event)) {
        this.logAnalyticsEvent({
          eventType: 'state_validation',
          userId: event.userId,
          action: 'state_transition',
          state: event.toState,
          metadata: {
            fromState: event.fromState,
            transactionId: event.transactionId,
            ...(event.metadata || {})
          },
          timestamp: event.timestamp
        });
      }
    });

    // Listen for state transition errors
    stateTransitionManager.onError(async (errorEvent) => {
      if ('error' in errorEvent) {
        this.logAnalyticsEvent({
          eventType: 'system_event',
          userId: errorEvent.userId,
          action: 'state_transition_error',
          metadata: {
            error: errorEvent.error,
            fromState: errorEvent.fromState,
            toState: errorEvent.toState,
            transactionId: errorEvent.transactionId
          },
          timestamp: errorEvent.timestamp
        });
      }
    });

    console.log('[ApiMiddleware] Event listeners initialized');
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract user ID from request body or query parameters
   */
  private async extractUserId(request: NextRequest): Promise<string | null> {
    try {
      // Try to get from request body first
      const body = await request.clone().json();
      if (body.userId) {
        return body.userId;
      }
    } catch {
      // If body parsing fails, try query parameters
    }

    // Try query parameters
    const url = new URL(request.url);
    const userIdFromQuery = url.searchParams.get('userId');
    if (userIdFromQuery) {
      return userIdFromQuery;
    }

    // Try headers (for some auth scenarios)
    const userIdFromHeader = request.headers.get('x-user-id');
    if (userIdFromHeader) {
      return userIdFromHeader;
    }

    return null;
  }

  /**
   * Validate user state against endpoint requirements
   */
  private async validateUserState(
    userId: string,
    config: ApiEndpointConfig
  ): Promise<{ valid: boolean; error?: string; currentState?: UserState | null }> {
    try {
      // Skip validation if configured
      if (config.skipStateValidation) {
        return { valid: true };
      }

      // Get current user state
      const currentState = await stateManager.getUserCurrentState(userId);

      // Check required states
      if (config.requiredStates && config.requiredStates.length > 0) {
        if (!currentState || !config.requiredStates.includes(currentState)) {
          return {
            valid: false,
            error: `User must be in one of these states: ${config.requiredStates.join(', ')}. Current state: ${currentState || 'none'}`,
            currentState
          };
        }
      }

      // Check forbidden states
      if (config.forbiddenStates && config.forbiddenStates.length > 0) {
        if (currentState && config.forbiddenStates.includes(currentState)) {
          return {
            valid: false,
            error: `User cannot be in state: ${currentState}`,
            currentState
          };
        }
      }

      // Run custom validation if provided
      if (config.customValidation) {
        const metadata = await userMetadataManager.getUserMetadata(userId);
        const customValid = await config.customValidation(userId, currentState, metadata);
        if (!customValid) {
          return {
            valid: false,
            error: 'Custom validation failed',
            currentState
          };
        }
      }

      return { valid: true, currentState };
    } catch (error) {
      console.error('[ApiMiddleware] Error validating user state:', error);
      return {
        valid: false,
        error: 'State validation error',
        currentState: null
      };
    }
  }

  /**
   * Log an API request
   */
  private logApiRequest(log: ApiRequestLog): void {
    this.requestLogs.set(log.requestId, log);

    // Maintain log size limit
    if (this.requestLogs.size > this.maxLogRetention) {
      const oldestKey = this.requestLogs.keys().next().value;
      this.requestLogs.delete(oldestKey);
    }

    // Console logging with structured format
    const logLevel = log.success ? 'info' : 'error';
    const duration = log.duration ? `${log.duration}ms` : 'unknown';
    
    console.log(`[ApiMiddleware:${logLevel.toUpperCase()}] ${log.method} ${log.endpoint} - ${duration} - User: ${log.userId || 'unknown'} - State: ${log.userState || 'unknown'} - Success: ${log.success}${log.error ? ` - Error: ${log.error}` : ''}`);
  }

  /**
   * Log an analytics event
   */
  private logAnalyticsEvent(event: AnalyticsEvent): void {
    this.analyticsEvents.push(event);

    // Maintain analytics size limit
    if (this.analyticsEvents.length > this.maxAnalyticsRetention) {
      this.analyticsEvents.shift();
    }

    console.log(`[Analytics] ${event.eventType} - ${event.action || 'unknown'} - User: ${event.userId || 'system'} - State: ${event.state || 'unknown'}`);
  }

  /**
   * Main middleware function for API requests
   */
  public async validateApiRequest(
    request: NextRequest,
    endpoint: string
  ): Promise<{
    valid: boolean;
    response?: NextResponse;
    requestId: string;
    userId?: string;
    startTime: number;
  }> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    const method = request.method;

    console.log(`[ApiMiddleware] Processing ${method} ${endpoint} (${requestId})`);

    // Get endpoint configuration
    const config = ENDPOINT_CONFIGS[endpoint];
    if (!config) {
      // No configuration means no validation required
      return {
        valid: true,
        requestId,
        startTime
      };
    }

    // Validate HTTP method
    if (config.allowedMethods && !config.allowedMethods.includes(method)) {
      const error = `Method ${method} not allowed for ${endpoint}`;
      this.logApiRequest({
        requestId,
        endpoint,
        method,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        error
      });

      return {
        valid: false,
        response: NextResponse.json(
          { success: false, error },
          { status: 405 }
        ),
        requestId,
        startTime
      };
    }

    // Extract user ID
    const userId = await this.extractUserId(request);
    if (config.requiresAuth && !userId) {
      const error = 'User ID required';
      this.logApiRequest({
        requestId,
        endpoint,
        method,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        error
      });

      return {
        valid: false,
        response: NextResponse.json(
          { success: false, error },
          { status: 400 }
        ),
        requestId,
        startTime
      };
    }

    // Validate user state if user ID is available
    if (userId) {
      const stateValidation = await this.validateUserState(userId, config);
      
      if (!stateValidation.valid) {
        this.logApiRequest({
          requestId,
          endpoint,
          method,
          userId,
          userState: stateValidation.currentState,
          timestamp: startTime,
          duration: Date.now() - startTime,
          success: false,
          error: stateValidation.error
        });

        // Log analytics event for failed validation
        this.logAnalyticsEvent({
          eventType: 'state_validation',
          userId,
          endpoint,
          action: 'validation_failed',
          state: stateValidation.currentState ?? undefined,
          metadata: { error: stateValidation.error },
          timestamp: startTime
        });

        return {
          valid: false,
          response: NextResponse.json(
            { success: false, error: stateValidation.error },
            { status: 400 }
          ),
          requestId,
          userId,
          startTime
        };
      }

      // Log successful validation
      this.logAnalyticsEvent({
        eventType: 'api_request',
        userId,
        endpoint,
        action: 'request_validated',
        state: stateValidation.currentState ?? undefined,
        timestamp: startTime
      });
    }

    return {
      valid: true,
      requestId,
      userId: userId ?? undefined,
      startTime
    };
  }

  /**
   * Log the completion of an API request
   */
  public logRequestCompletion(
    requestId: string,
    endpoint: string,
    method: string,
    userId: string | undefined,
    userState: UserState | null | undefined,
    startTime: number,
    success: boolean,
    error?: string,
    metadata?: Record<string, unknown>
  ): void {
    const duration = Date.now() - startTime;

    this.logApiRequest({
      requestId,
      endpoint,
      method,
      userId,
      userState,
      timestamp: startTime,
      duration,
      success,
      error,
      metadata
    });

    // Log analytics event for request completion
    if (userId) {
      this.logAnalyticsEvent({
        eventType: 'api_request',
        userId,
        endpoint,
        action: success ? 'request_completed' : 'request_failed',
        state: userState ?? undefined,
        metadata: {
          duration,
          error,
          ...metadata
        },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get recent request logs for debugging
   */
  public getRecentLogs(limit: number = 100): ApiRequestLog[] {
    const logs = Array.from(this.requestLogs.values());
    return logs.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get analytics events for a specific user
   */
  public getUserAnalytics(userId: string, limit: number = 50): AnalyticsEvent[] {
    return this.analyticsEvents
      .filter(event => event.userId === userId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get system-wide analytics summary
   */
  public getAnalyticsSummary(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    topEndpoints: Array<{ endpoint: string; count: number }>;
    recentErrors: Array<{ error: string; count: number }>;
  } {
    const logs = Array.from(this.requestLogs.values());
    const totalRequests = logs.length;
    const successfulRequests = logs.filter(log => log.success).length;
    const failedRequests = totalRequests - successfulRequests;

    // Count endpoint usage
    const endpointCounts = new Map<string, number>();
    logs.forEach(log => {
      endpointCounts.set(log.endpoint, (endpointCounts.get(log.endpoint) || 0) + 1);
    });

    const topEndpoints = Array.from(endpointCounts.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Count recent errors
    const errorCounts = new Map<string, number>();
    logs.filter(log => !log.success && log.error).forEach(log => {
      const error = log.error!;
      errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
    });

    const recentErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      topEndpoints,
      recentErrors
    };
  }

  /**
   * Clear old logs and analytics (for maintenance)
   */
  public clearOldData(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - olderThanMs;
    let cleared = 0;

    // Clear old request logs
    for (const [requestId, log] of this.requestLogs.entries()) {
      if (log.timestamp < cutoffTime) {
        this.requestLogs.delete(requestId);
        cleared++;
      }
    }

    // Clear old analytics events
    const originalLength = this.analyticsEvents.length;
    this.analyticsEvents = this.analyticsEvents.filter(event => event.timestamp >= cutoffTime);
    cleared += originalLength - this.analyticsEvents.length;

    console.log(`[ApiMiddleware] Cleared ${cleared} old records`);
    return cleared;
  }
}

// Create and export singleton instance
export const apiMiddleware = ApiMiddlewareManager.getInstance();

// Export convenience functions
export const validateApiRequest = (request: NextRequest, endpoint: string) =>
  apiMiddleware.validateApiRequest(request, endpoint);

export const logRequestCompletion = (
  requestId: string,
  endpoint: string,
  method: string,
  userId: string | undefined,
  userState: UserState | null | undefined,
  startTime: number,
  success: boolean,
  error?: string,
  metadata?: Record<string, unknown>
) => apiMiddleware.logRequestCompletion(requestId, endpoint, method, userId, userState, startTime, success, error, metadata);

export const getRecentLogs = (limit?: number) => apiMiddleware.getRecentLogs(limit);
export const getUserAnalytics = (userId: string, limit?: number) => apiMiddleware.getUserAnalytics(userId, limit);
export const getAnalyticsSummary = () => apiMiddleware.getAnalyticsSummary(); 