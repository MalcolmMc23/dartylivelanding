import { NextRequest, NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();
    
    if (!username) {
      return NextResponse.json(
        { error: 'Missing username' },
        { status: 400 }
      );
    }
    
    // Remove user from the waiting queue
    const wasRemoved = await hybridMatchingService.removeUserFromQueue(username);
    
    return NextResponse.json({
      status: wasRemoved ? 'cancelled' : 'not_found',
      message: wasRemoved 
        ? 'Successfully removed from waiting queue' 
        : 'User not found in waiting queue'
    });
  } catch (error) {
    console.error('Error in cancel-match:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 