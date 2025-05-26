import { NextResponse } from 'next/server';
import { validateActiveMatches } from '@/utils/redis/matchValidator';

export async function POST() {
  try {
    console.log('Manual match validation triggered');
    
    const result = await validateActiveMatches();
    
    return NextResponse.json({
      success: true,
      result,
      message: `Validation completed: ${result.validMatches} valid, ${result.invalidMatches} invalid, ${result.usersRequeued} users requeued`
    });
    
  } catch (error) {
    console.error('Error in validate-matches API:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error', 
        details: String(error) 
      }, 
      { status: 500 }
    );
  }
}

export async function GET() {
  // Same as POST for convenience
  return POST();
} 