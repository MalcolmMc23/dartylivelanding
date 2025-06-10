import { NextRequest, NextResponse } from 'next/server';
import { validateApiRequest, logRequestCompletion } from '@/lib/apiMiddleware';
import { userMetadataManager } from '@/lib/userMetadata';
import { stateManager } from '@/lib/stateManager';

export async function POST(request: NextRequest) {
  const {
    valid,
    response,
    requestId,
    userId,
    startTime
  } = await validateApiRequest(request, '/api/simple-matching/heartbeat');

  if (!valid) {
    return response;
  }

  const validatedUserId = userId!;
  const currentState = await stateManager.getUserCurrentState(validatedUserId);

  try {
    // Update last heartbeat and last activity timestamp in user metadata
    await userMetadataManager.updateUserMetadata(validatedUserId, {
      lastHeartbeat: Date.now(),
      lastActivity: Date.now(),
    });

    logRequestCompletion(requestId, '/api/simple-matching/heartbeat', 'POST', validatedUserId, currentState, startTime, true);
    return NextResponse.json({ success: true, message: 'Heartbeat received' });

  } catch (error: any) {
    console.error('[Heartbeat] Unhandled error:', error);
    logRequestCompletion(requestId, '/api/simple-matching/heartbeat', 'POST', validatedUserId, currentState, startTime, false, error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}