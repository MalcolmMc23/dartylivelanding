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
  } = await validateApiRequest(request, '/api/simple-matching/check-disconnect');

  if (!valid) {
    return response;
  }

  const validatedUserId = userId!;
  const currentState = await stateManager.getUserCurrentState(validatedUserId);

  try {
    const metadata = await userMetadataManager.getUserMetadata(validatedUserId);

    // If user is in DISCONNECTING state, it's a confirmed disconnect
    if (metadata?.state === 'DISCONNECTING') {
      const disconnectInfo = {
        reason: metadata.lastAction, // 'skip' or 'end'
        initiatedBy: metadata.lastAction === 'skip' ? 'peer' : (metadata.lastAction === 'end' ? 'peer' : 'system'),
      };
      
      logRequestCompletion(requestId, '/api/simple-matching/check-disconnect', 'GET', validatedUserId, currentState, startTime, true, undefined, { disconnected: true, ...disconnectInfo });
      
      // Once notified, we can potentially move them to the final state (IDLE or WAITING)
      // This could be handled here or in a separate cleanup job
      if (disconnectInfo.reason === 'skip') {
        await stateManager.moveUserBetweenStates(validatedUserId, 'DISCONNECTING', 'WAITING');
      } else {
        await stateManager.moveUserBetweenStates(validatedUserId, 'DISCONNECTING', 'IDLE');
      }

      return NextResponse.json({
        success: true,
        disconnected: true,
        ...disconnectInfo
      });
    }
    
    // If user is not IN_CALL or CONNECTING anymore, they were likely disconnected
    if (currentState !== 'IN_CALL' && currentState !== 'CONNECTING') {
        logRequestCompletion(requestId, '/api/simple-matching/check-disconnect', 'GET', validatedUserId, currentState, startTime, true, undefined, { disconnected: true, reason: 'state_change' });
        return NextResponse.json({ success: true, disconnected: true, reason: 'state_change' });
    }

    logRequestCompletion(requestId, '/api/simple-matching/check-disconnect', 'GET', validatedUserId, currentState, startTime, true, undefined, { disconnected: false });
    return NextResponse.json({ success: true, disconnected: false });

  } catch (error: any) {
    console.error('[CheckDisconnect] Unhandled error:', error);
    logRequestCompletion(requestId, '/api/simple-matching/check-disconnect', 'GET', validatedUserId, currentState, startTime, false, error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}