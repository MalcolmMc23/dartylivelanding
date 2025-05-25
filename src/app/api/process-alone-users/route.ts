import { NextResponse } from 'next/server';
import { processAloneUsers } from '@/utils/redis/aloneUserManager';

export async function POST() {
  try {
    console.log('Manual alone user processing triggered');
    
    const result = await processAloneUsers();
    
    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      message: 'Alone user processing completed'
    });
  } catch (error) {
    console.error('Error during manual alone user processing:', error);
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