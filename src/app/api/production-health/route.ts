import { NextRequest, NextResponse } from 'next/server';
import { 
  performHealthCheck, 
  autoRepairProductionIssues, 
  getDetailedSystemStatus,
  forceRestartMatchingSystem,
  clearStaleLocks 
} from '@/utils/redis/productionHealthCheck';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const detailed = searchParams.get('detailed') === 'true';

    if (action === 'status') {
      if (detailed) {
        const status = await getDetailedSystemStatus();
        return NextResponse.json(status);
      } else {
        const health = await performHealthCheck();
        return NextResponse.json(health);
      }
    }

    if (action === 'repair') {
      const repairs = await autoRepairProductionIssues();
      return NextResponse.json({
        success: true,
        repairs,
        message: `Completed ${repairs.length} auto-repairs`,
        timestamp: Date.now()
      });
    }

    if (action === 'restart') {
      const steps = await forceRestartMatchingSystem();
      return NextResponse.json({
        success: true,
        steps,
        message: 'Matching system restart completed',
        timestamp: Date.now()
      });
    }

    if (action === 'clear-locks') {
      const cleared = await clearStaleLocks();
      return NextResponse.json({
        success: true,
        cleared,
        message: cleared ? 'Stale locks cleared' : 'No stale locks found',
        timestamp: Date.now()
      });
    }

    // Default: return basic health status
    const health = await performHealthCheck();
    return NextResponse.json(health);

  } catch (error) {
    console.error('Error in production health endpoint:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Health check failed',
        details: String(error),
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'force-repair') {
      const repairs = await autoRepairProductionIssues();
      const status = await performHealthCheck();
      
      return NextResponse.json({
        success: true,
        repairs,
        healthAfterRepair: status,
        message: `Force repair completed with ${repairs.length} actions`,
        timestamp: Date.now()
      });
    }

    if (action === 'emergency-restart') {
      const steps = await forceRestartMatchingSystem();
      
      // Wait a moment then check health
      await new Promise(resolve => setTimeout(resolve, 3000));
      const statusAfter = await performHealthCheck();
      
      return NextResponse.json({
        success: true,
        steps,
        healthAfterRestart: statusAfter,
        message: 'Emergency restart completed',
        timestamp: Date.now()
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use force-repair or emergency-restart' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error in production health POST:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Production health action failed',
        details: String(error),
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
} 