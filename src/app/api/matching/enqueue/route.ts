import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import pool from '@/lib/db';
import redis from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';
import { createRoom, generateToken } from '@/lib/livekitService';

export async function POST() {
  try {
    // Get authenticated user
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get username from database
    const userResult = await pool.query(
      'SELECT username FROM "user" WHERE email = $1',
      [session.user.email]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const username = userResult.rows[0].username;
    const userId = username; // Using username as userId for now

    // Check if user is already in queue or in a session
    const inQueue = await redis.zrange('matching:waiting', 0, -1);
    if (inQueue.includes(userId)) {
      return NextResponse.json(
        { success: false, error: 'Already in queue' },
        { status: 400 }
      );
    }

    // Try to find a match from the waiting queue
    const waitingUsers = await redis.zrange('matching:waiting', 0, -1);
    
    // Filter out blocked users (simplified for now)
    const availableUsers = waitingUsers; // TODO: Implement blocklist filtering

    if (availableUsers.length > 0) {
      // Found a match!
      const matchedUserId = availableUsers[0];
      
      // Remove matched user from queue
      await redis.zrem('matching:waiting', matchedUserId);
      
      // Create session
      const sessionId = uuidv4();
      const roomName = `room_${sessionId}`;
      
      // Create LiveKit room
      try {
        await createRoom(roomName);
      } catch (error) {
        console.error('Failed to create LiveKit room:', error);
        // Re-add matched user to queue if room creation fails
        await redis.zadd('matching:waiting', Date.now(), matchedUserId);
        return NextResponse.json(
          { success: false, error: 'Failed to create video room' },
          { status: 500 }
        );
      }
      
      // Store session in database
      await pool.query(
        'INSERT INTO sessions (id, user_a_username, user_b_username, room_name) VALUES ($1, $2, $3, $4)',
        [sessionId, userId, matchedUserId, roomName]
      );
      
      // Add both users to in_call set
      const now = Date.now();
      await redis.zadd('matching:in_call', now, userId);
      await redis.zadd('matching:in_call', now, matchedUserId);
      
      // Generate LiveKit token for the requesting user
      const accessToken = await generateToken(roomName, userId);
      
      // TODO: Notify the matched user about the session
      // This could be done via WebSocket, Server-Sent Events, or polling
      
      return NextResponse.json({
        success: true,
        data: {
          sessionId,
          roomName,
          accessToken,
          peerId: matchedUserId
        }
      });
    } else {
      // No match available, add to queue
      const now = Date.now();
      await redis.zadd('matching:waiting', now, userId);
      
      return NextResponse.json({
        success: true,
        data: null,
        message: 'Added to queue'
      });
    }
  } catch (error) {
    console.error('Error in enqueue:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 