import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import pool from '@/lib/db';
import redis from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';
import { createRoom, generateToken, deleteRoom } from '@/lib/livekitService';

export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json();
    
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
    const userId = username;

    // Update current session as ended
    await pool.query(
      'UPDATE sessions SET ended_at = NOW(), ended_by = $1 WHERE id = $2',
      ['user_skip', sessionId]
    );

    // Get the room name to delete
    const sessionResult = await pool.query(
      'SELECT room_name FROM sessions WHERE id = $1',
      [sessionId]
    );
    
    if (sessionResult.rows.length > 0) {
      // Delete the LiveKit room
      await deleteRoom(sessionResult.rows[0].room_name);
    }

    // Remove user from in_call set
    await redis.zrem('matching:in_call', userId);

    // Try to find a new match
    const waitingUsers = await redis.zrange('matching:waiting', 0, -1);
    const availableUsers = waitingUsers; // TODO: Implement blocklist filtering

    if (availableUsers.length > 0) {
      // Found a new match!
      const matchedUserId = availableUsers[0];
      
      // Remove matched user from queue
      await redis.zrem('matching:waiting', matchedUserId);
      
      // Create new session
      const newSessionId = uuidv4();
      const roomName = `room_${newSessionId}`;
      
      // Create LiveKit room
      try {
        await createRoom(roomName);
      } catch (error) {
        console.error('Failed to create LiveKit room:', error);
        // Re-add both users to queue if room creation fails
        const now = Date.now();
        await redis.zadd('matching:waiting', now, matchedUserId);
        await redis.zadd('matching:waiting', now, userId);
        return NextResponse.json(
          { success: false, error: 'Failed to create video room' },
          { status: 500 }
        );
      }
      
      // Store new session in database
      await pool.query(
        'INSERT INTO sessions (id, user_a_username, user_b_username, room_name) VALUES ($1, $2, $3, $4)',
        [newSessionId, userId, matchedUserId, roomName]
      );
      
      // Add both users to in_call set
      const now = Date.now();
      await redis.zadd('matching:in_call', now, userId);
      await redis.zadd('matching:in_call', now, matchedUserId);
      
      // Generate LiveKit token
      const accessToken = await generateToken(roomName, userId);
      
      return NextResponse.json({
        success: true,
        data: {
          sessionId: newSessionId,
          roomName,
          accessToken,
          peerId: matchedUserId
        }
      });
    } else {
      // No match available, add back to queue
      const now = Date.now();
      await redis.zadd('matching:waiting', now, userId);
      
      return NextResponse.json({
        success: true,
        data: null,
        message: 'Added back to queue'
      });
    }
  } catch (error) {
    console.error('Error in skip:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 