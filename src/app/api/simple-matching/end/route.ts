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
  } = await validateApiRequest(request, '/api/simple-matching/end');

  if (!valid) {
    return response;
  }

  const validatedUserId = userId!;

  try {
    const metadata = await userMetadataManager.getUserMetadata(validatedUserId);
    if (!metadata || !metadata.matchedWith) {
      const error = 'User not in a valid match';
      logRequestCompletion(requestId, '/api/simple-matching/end', 'POST', validatedUserId, 'IN_CALL', startTime, false, error);
      return NextResponse.json({ success: false, error }, { status: 400 });
    }
    const otherUserId = metadata.matchedWith;

    const endResult = await stateMachine.handleEndCall(validatedUserId, otherUserId);

    if (!endResult.success) {
      logRequestCompletion(requestId, '/api/simple-matching/end', 'POST', validatedUserId, 'IN_CALL', startTime, false, endResult.error);
      return NextResponse.json(
        { success: false, error: endResult.error },
        { status: 400 }
      );
    }

    logRequestCompletion(requestId, '/api/simple-matching/end', 'POST', validatedUserId, 'IDLE', startTime, true, undefined, {
      otherUserId: endResult.metadata?.otherUserId
    });
    
    return NextResponse.json({ success: true, message: 'End call successful. You are now idle, the other user is re-queued.' });

  } catch (error: any) {
    console.error('[End] Unhandled error:', error);
    const currentState = await stateManager.getUserCurrentState(validatedUserId);
    logRequestCompletion(requestId, '/api/simple-matching/end', 'POST', validatedUserId, currentState, startTime, false, error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}