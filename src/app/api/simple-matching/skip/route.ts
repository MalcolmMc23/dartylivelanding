import { NextRequest, NextResponse } from 'next/server';
import { validateApiRequest, logRequestCompletion } from '@/lib/apiMiddleware';
import { stateMachine } from '@/lib/stateMachine';
import { userMetadataManager } from '@/lib/userMetadata';
import { stateManager } from '@/lib/stateManager';

export async function POST(request: NextRequest) {
  const {
    valid,
    response,
    requestId,
    userId,
    startTime
  } = await validateApiRequest(request, '/api/simple-matching/skip');

  if (!valid) {
    return response;
  }

  // After validation with requiresAuth: true, userId is guaranteed to be a string
  const validatedUserId = userId!;

  try {
    const metadata = await userMetadataManager.getUserMetadata(validatedUserId);
    if (!metadata || !metadata.matchedWith) {
      const error = 'User not in a valid match';
      logRequestCompletion(requestId, '/api/simple-matching/skip', 'POST', validatedUserId, 'IN_CALL', startTime, false, error);
      return NextResponse.json({ success: false, error }, { status: 400 });
    }
    const otherUserId = metadata.matchedWith;

    const skipResult = await stateMachine.handleSkip(validatedUserId, otherUserId, validatedUserId);

    if (!skipResult.success) {
      logRequestCompletion(requestId, '/api/simple-matching/skip', 'POST', validatedUserId, 'IN_CALL', startTime, false, skipResult.error);
      return NextResponse.json(
        { success: false, error: skipResult.error },
        { status: 400 }
      );
    }

    logRequestCompletion(requestId, '/api/simple-matching/skip', 'POST', validatedUserId, 'WAITING', startTime, true, undefined, {
      otherUserId: skipResult.metadata?.otherUserId
    });
    
    return NextResponse.json({ success: true, message: 'Skip successful, both users re-queued' });

  } catch (error: any) {
    console.error('[Skip] Unhandled error:', error);
    const currentState = await stateManager.getUserCurrentState(validatedUserId);
    logRequestCompletion(requestId, '/api/simple-matching/skip', 'POST', validatedUserId, currentState, startTime, false, error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}