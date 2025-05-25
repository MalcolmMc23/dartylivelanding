import redis from '../../lib/redis';
import { ACTIVE_MATCHES } from './constants';

// Add a notification key prefix
export const MATCH_NOTIFICATION_PREFIX = 'match_notification:';
export const MATCH_NOTIFICATION_TTL = 60; // 60 seconds TTL

/**
 * Create a match notification for both users
 */
export async function createMatchNotification(
  user1: string,
  user2: string,
  roomName: string,
  useDemo: boolean
): Promise<void> {
  const notification = {
    roomName,
    matchedWith: '',
    useDemo,
    timestamp: Date.now()
  };

  // Create notification for user1
  const notification1 = { ...notification, matchedWith: user2 };
  await redis.setex(
    `${MATCH_NOTIFICATION_PREFIX}${user1}`,
    MATCH_NOTIFICATION_TTL,
    JSON.stringify(notification1)
  );

  // Create notification for user2
  const notification2 = { ...notification, matchedWith: user1 };
  await redis.setex(
    `${MATCH_NOTIFICATION_PREFIX}${user2}`,
    MATCH_NOTIFICATION_TTL,
    JSON.stringify(notification2)
  );

  console.log(`Created match notifications for ${user1} and ${user2} in room ${roomName}`);
}

/**
 * Check if a user has a match notification
 */
export async function checkMatchNotification(username: string): Promise<{
  hasNotification: boolean;
  roomName?: string;
  matchedWith?: string;
  useDemo?: boolean;
} | null> {
  const notificationKey = `${MATCH_NOTIFICATION_PREFIX}${username}`;
  const notificationData = await redis.get(notificationKey);

  if (!notificationData) {
    return null;
  }

  try {
    const notification = JSON.parse(notificationData);
    
    // Verify the match still exists
    const matchData = await redis.hget(ACTIVE_MATCHES, notification.roomName);
    if (!matchData) {
      // Match no longer exists, clear notification
      await redis.del(notificationKey);
      return null;
    }

    return {
      hasNotification: true,
      roomName: notification.roomName,
      matchedWith: notification.matchedWith,
      useDemo: notification.useDemo
    };
  } catch (error) {
    console.error(`Error parsing match notification for ${username}:`, error);
    return null;
  }
}

/**
 * Clear a match notification
 */
export async function clearMatchNotification(username: string): Promise<void> {
  await redis.del(`${MATCH_NOTIFICATION_PREFIX}${username}`);
} 