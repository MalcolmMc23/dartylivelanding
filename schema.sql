-- Create tables for the matching system

-- Users table for authentication and state
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'idle', -- e.g., idle, waiting, in-call
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table for tracking matches
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Using UUID for session IDs
  user_a_username VARCHAR(255) NOT NULL,
  user_b_username VARCHAR(255) NOT NULL,
  room_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE,
  ended_by VARCHAR(50), -- e.g., 'user_a_skip', 'user_b_end', 'disconnect'
  FOREIGN KEY (user_a_username) REFERENCES users(username) ON DELETE SET NULL, -- Keep session record even if user is deleted
  FOREIGN KEY (user_b_username) REFERENCES users(username) ON DELETE SET NULL
);

-- Block list for preventing matches
CREATE TABLE IF NOT EXISTS blocklist (
  id SERIAL PRIMARY KEY,
  blocker_username VARCHAR(255) NOT NULL,
  blocked_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (blocker_username) REFERENCES users(username) ON DELETE CASCADE,
  FOREIGN KEY (blocked_username) REFERENCES users(username) ON DELETE CASCADE,
  UNIQUE(blocker_username, blocked_username) -- Prevent duplicate block entries
);

-- Remove old tables if they exist (or archive/migrate them)
DROP TABLE IF EXISTS waiting_users;
DROP TABLE IF EXISTS matched_pairs;

-- Optional: Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_sessions_room_name ON sessions(room_name);
CREATE INDEX IF NOT EXISTS idx_sessions_user_a ON sessions(user_a_username);
CREATE INDEX IF NOT EXISTS idx_sessions_user_b ON sessions(user_b_username);
CREATE INDEX IF NOT EXISTS idx_blocklist_blocker ON blocklist(blocker_username); 