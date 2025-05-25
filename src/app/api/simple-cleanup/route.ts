import { NextResponse } from 'next/server';
import * as simpleMatchingService from '@/utils/redis/simpleMatchingService';

export async function POST() {
  try {
    console.log('Running simple matching service cleanup');
    await simpleMatchingService.cleanup();
    return NextResponse.json({ status: 'success', message: 'Cleanup completed' });
  } catch (error) {
    console.error('Error during cleanup:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}

// Allow GET for easy testing
export async function GET() {
  return POST();
} 