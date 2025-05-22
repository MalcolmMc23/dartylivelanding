// Redis queue and key names
export const WAITING_QUEUE = 'matching:waiting';
export const IN_CALL_QUEUE = 'matching:in_call';
export const ACTIVE_MATCHES = 'matching:active';
export const USED_ROOM_NAMES = 'matching:used_room_names'; // Track used room names to prevent reuse
export const MATCH_LOCK_KEY = "match_lock";
export const LOCK_EXPIRY = 10; // 3 seconds instead of 5
export const LEFT_BEHIND_PREFIX = 'left_behind:'; 