import db from '@/lib/db';

// Interface definitions
export interface WaitingUser {
  id: number;
  username: string;
  joined_at: Date;
  use_demo: boolean;
  in_call: boolean;
  room_name?: string;
  last_matched_with?: string;
  last_matched_at?: Date;
}

export interface MatchedPair {
  id: number;
  user1: string;
  user2: string;
  room_name: string;
  use_demo: boolean;
  matched_at: Date;
}

// Add user to waiting queue
export async function addUserToQueue(
  username: string, 
  useDemo: boolean, 
  inCall = false, 
  roomName?: string, 
  lastMatch?: { matchedWith: string }
) {
  // Use ON CONFLICT to handle the case where the user already exists
  const result = await db.query(
    `INSERT INTO waiting_users (username, use_demo, in_call, room_name, last_matched_with, last_matched_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (username) 
     DO UPDATE SET 
       joined_at = NOW(),
       use_demo = $2,
       in_call = $3,
       room_name = $4,
       last_matched_with = $5,
       last_matched_at = CASE WHEN $5 IS NOT NULL THEN NOW() ELSE waiting_users.last_matched_at END
     RETURNING *`,
    [username, useDemo, inCall, roomName, lastMatch?.matchedWith, lastMatch?.matchedWith ? new Date() : null]
  );
  
  console.log(`Added/updated ${username} in waiting queue`, result.rows[0]);
  return result.rows[0];
}

// Remove user from waiting queue
export async function removeUserFromQueue(username: string) {
  const result = await db.query(
    'DELETE FROM waiting_users WHERE username = $1 RETURNING *',
    [username]
  );
  
  if (result.rowCount && result.rowCount > 0) {
    console.log(`Removed ${username} from waiting queue`);
  }
  
  return result.rowCount ? result.rowCount > 0 : false;
}

// Find match for user with proper transactions
export async function findMatchForUser(username: string, useDemo: boolean, lastMatchedWith?: string) {
  // Start a database transaction to ensure atomicity
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Add additional condition to prevent matching with the person the user just left
    const lastMatchCondition = lastMatchedWith ? 'AND username != $2' : '';
    const params = lastMatchedWith ? [username, lastMatchedWith] : [username];
    
    // First check for users already in calls (prioritize them)
    let potentialMatch = await client.query(
      `SELECT * FROM waiting_users 
       WHERE in_call = TRUE 
       AND username != $1
       ${lastMatchCondition}
       AND (last_matched_with != $1 OR last_matched_at < NOW() - INTERVAL '5 minutes' OR last_matched_with IS NULL)
       ORDER BY joined_at ASC 
       LIMIT 1`,
      params
    );
    
    // If no users in calls, find any waiting user
    if (!potentialMatch.rowCount || potentialMatch.rowCount === 0) {
      potentialMatch = await client.query(
        `SELECT * FROM waiting_users 
         WHERE in_call = FALSE 
         AND username != $1
         ${lastMatchCondition}
         AND (last_matched_with != $1 OR last_matched_at < NOW() - INTERVAL '5 minutes' OR last_matched_with IS NULL)
         ORDER BY joined_at ASC 
         LIMIT 1`,
        params
      );
    }
    
    if (potentialMatch.rowCount && potentialMatch.rowCount > 0) {
      const match = potentialMatch.rows[0];
      
      // Determine room name (use existing room if matched user is in call)
      const roomName = match.in_call ? match.room_name : `match-${Math.random().toString(36).substring(2, 10)}`;
      const finalUseDemo = useDemo || match.use_demo;
      
      console.log(`Matched user ${username} with ${match.username}${match.in_call ? ' who was alone in room ' + roomName : ''}`);
      
      // Record the match
      await client.query(
        `INSERT INTO matched_pairs (user1, user2, room_name, use_demo)
         VALUES ($1, $2, $3, $4)`,
        [username, match.username, roomName, finalUseDemo]
      );
      
      // Remove both users from waiting queue
      await client.query(
        'DELETE FROM waiting_users WHERE username IN ($1, $2)',
        [username, match.username]
      );
      
      await client.query('COMMIT');
      
      return {
        status: 'matched',
        roomName,
        matchedWith: match.username,
        useDemo: finalUseDemo
      };
    } else {
      // No match found, add user to queue (already done in caller)
      await client.query('COMMIT');
      return { status: 'waiting' };
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Transaction error:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Handle user disconnection
export async function handleUserDisconnection(username: string, roomName: string, otherUsername?: string) {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Find the match
    const matchResult = await client.query(
      'SELECT * FROM matched_pairs WHERE room_name = $1',
      [roomName]
    );
    
    if (!matchResult.rowCount || matchResult.rowCount === 0) {
      await client.query('COMMIT');
      return { status: 'no_match_found' };
    }
    
    const match = matchResult.rows[0];
    
    // Determine who's left behind
    let leftBehindUser: string;
    
    if (otherUsername) {
      // If otherUsername is provided, it's the user who remained
      leftBehindUser = otherUsername;
    } else {
      // If no otherUsername provided, determine who's left behind
      leftBehindUser = match.user1 === username ? match.user2 : match.user1;
    }
    
    // Remove the match
    await client.query(
      'DELETE FROM matched_pairs WHERE room_name = $1',
      [roomName]
    );
    
    // Add left-behind user back to queue
    await client.query(
      `INSERT INTO waiting_users (username, use_demo, in_call, room_name, last_matched_with, last_matched_at)
       VALUES ($1, $2, TRUE, $3, $4, NOW())
       ON CONFLICT (username) 
       DO UPDATE SET 
         joined_at = NOW(),
         use_demo = $2,
         in_call = TRUE,
         room_name = $3,
         last_matched_with = $4,
         last_matched_at = NOW()`,
      [leftBehindUser, match.use_demo, roomName, username]
    );
    
    await client.query('COMMIT');
    
    console.log(`User ${username} disconnected, left behind user ${leftBehindUser} added to waiting queue`);
    
    return {
      status: 'disconnected',
      leftBehindUser,
      users: [match.user1, match.user2]
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Transaction error:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Cleanup functions
export async function cleanupOldWaitingUsers() {
  const result = await db.query(
    `DELETE FROM waiting_users 
     WHERE joined_at < NOW() - INTERVAL '5 minutes'
     RETURNING username`,
  );
  
  if (result.rowCount && result.rowCount > 0) {
    console.log(`Cleaned up ${result.rowCount} stale users from waiting queue`);
  }
  
  return result.rows;
}

export async function cleanupOldMatches() {
  const result = await db.query(
    `DELETE FROM matched_pairs 
     WHERE matched_at < NOW() - INTERVAL '10 minutes'
     RETURNING user1, user2, room_name`,
  );
  
  if (result.rowCount && result.rowCount > 0) {
    console.log(`Cleaned up ${result.rowCount} stale matched pairs`);
  }
  
  return result.rows;
}

// Get waiting queue status
export async function getWaitingQueueStatus(username: string) {
  const result = await db.query(
    `SELECT * FROM waiting_users WHERE username = $1`,
    [username]
  );
  
  if (!result.rowCount || result.rowCount === 0) {
    // Check if user has been matched already
    const matchResult = await db.query(
      `SELECT * FROM matched_pairs 
       WHERE user1 = $1 OR user2 = $1`,
      [username]
    );
    
    if (matchResult.rowCount && matchResult.rowCount > 0) {
      const match = matchResult.rows[0];
      return {
        status: 'matched',
        roomName: match.room_name,
        matchedWith: match.user1 === username ? match.user2 : match.user1,
        useDemo: match.use_demo
      };
    }
    
    return { status: 'not_waiting' };
  }
  
  // User is in waiting queue
  // Get position in queue
  const positionResult = await db.query(
    `SELECT COUNT(*) FROM waiting_users 
     WHERE joined_at <= (SELECT joined_at FROM waiting_users WHERE username = $1)`,
    [username]
  );
  
  const queueSizeResult = await db.query('SELECT COUNT(*) FROM waiting_users');
  
  return {
    status: 'waiting',
    position: parseInt(positionResult.rows[0].count, 10),
    queueSize: parseInt(queueSizeResult.rows[0].count, 10)
  };
} 