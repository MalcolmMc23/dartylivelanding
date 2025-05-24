// Redis queue and key names
export const MATCHING_QUEUE = 'matching:queue'; // New single queue that replaces separate waiting and in-call queues
export const ACTIVE_MATCHES = 'matching:active';
export const USED_ROOM_NAMES = 'matching:used_room_names'; // Track used room names to prevent reuse
export const MATCH_LOCK_KEY = "match_lock";
export const LOCK_EXPIRY = 10; // 10 seconds 
export const LEFT_BEHIND_PREFIX = 'left_behind:'; 
export const RECENT_MATCH_PREFIX = 'recent_match:'; // For simplified cooldown tracking

// Legacy constants - kept for migration code, will remove after full transition
export const WAITING_QUEUE = 'matching:waiting';
export const IN_CALL_QUEUE = 'matching:in_call'; 