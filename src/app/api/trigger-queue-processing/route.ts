import { NextResponse } from 'next/server';
import * as hybridMatchingService from '@/utils/hybridMatchingService';

export async function POST() {
  try {
    console.log('Manual queue processing trigger requested');
    
    // Trigger immediate queue processing
    const result = await hybridMatchingService.triggerImmediateProcessing();
    
    console.log('Manual queue processing completed:', result);
    
    return NextResponse.json({
      success: true,
      result,
      message: `Processed ${result.usersProcessed} users, created ${result.matchesCreated} matches`,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error in manual queue processing:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process queue',
        details: String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const isRunning = hybridMatchingService.isBackgroundProcessorRunning();
    
    return NextResponse.json({
      isRunning,
      message: isRunning ? 'Background processor is running' : 'Background processor is not running',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error checking queue processor status:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to check processor status',
        details: String(error)
      },
      { status: 500 }
    );
  }
} 