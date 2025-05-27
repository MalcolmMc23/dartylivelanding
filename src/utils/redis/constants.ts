// Redis queue and key names
export const MATCHING_QUEUE = 'matching:queue'; // New single queue that replaces separate waiting and in-call queues
export const ACTIVE_MATCHES = 'matching:active';
export const USED_ROOM_NAMES = 'matching:used_room_names'; // Track used room names to prevent reuse
export const MATCH_LOCK_KEY = "match_lock";
export const LOCK_EXPIRY = 10; // 10 seconds 
export const LEFT_BEHIND_PREFIX = 'left_behind:'; 
export const RECENT_MATCH_PREFIX = 'recent_match:'; // For simplified cooldown tracking

// Room tracking keys for LiveKit synchronization
export const ROOM_PARTICIPANTS = 'rooms:participants'; // Track actual LiveKit participants
export const ROOM_STATES = 'rooms:states'; // Track room states (active, empty, etc.)
export const LIVEKIT_SYNC_LOCK = 'livekit:sync:lock'; // Lock for sync operations 