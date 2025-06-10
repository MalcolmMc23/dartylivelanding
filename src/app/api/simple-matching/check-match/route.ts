import { NextRequest, NextResponse } from 'next/server';
import { validateApiRequest, logRequestCompletion } from '@/lib/apiMiddleware';
import { stateManager } from '@/lib/stateManager';
import { userMetadataManager } from '@/lib/userMetadata';

export async function GET(request: NextRequest) {
  const {
    valid,
    response,
    requestId,
    userId,
    startTime
  } = await validateApiRequest(request, '/api/simple-matching/check-match');

  if (!valid) {
    return response;
  }

  const validatedUserId = userId!;
  const currentState = await stateManager.getUserCurrentState(validatedUserId);

  try {
    const metadata = await userMetadataManager.getUserMetadata(validatedUserId);

    if (metadata?.state === 'CONNECTING' && metadata.currentRoom && metadata.matchedWith) {
      logRequestCompletion(requestId, '/api/simple-matching/check-match', 'GET', validatedUserId, currentState, startTime, true, undefined, { matched: true });
      return NextResponse.json({
        success: true,
        matched: true,
        roomName: metadata.currentRoom,
        peerId: metadata.matchedWith
      });
    }

    logRequestCompletion(requestId, '/api/simple-matching/check-match', 'GET', validatedUserId, currentState, startTime, true, undefined, { matched: false });
    return NextResponse.json({ success: true, matched: false });

  } catch (error: any) {
    console.error('[CheckMatch] Unhandled error:', error);
    logRequestCompletion(requestId, '/api/simple-matching/check-match', 'GET', validatedUserId, currentState, startTime, false, error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}