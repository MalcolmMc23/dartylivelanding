-- Create tables for the matching system
CREATE TABLE IF NOT EXISTS waiting_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  use_demo BOOLEAN DEFAULT FALSE,
  in_call BOOLEAN DEFAULT FALSE,
  room_name VARCHAR(255),
  last_matched_with VARCHAR(255),
  last_matched_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS matched_pairs (
  id SERIAL PRIMARY KEY,
  user1 VARCHAR(255) NOT NULL,
  user2 VARCHAR(255) NOT NULL,
  room_name VARCHAR(255) NOT NULL,
  use_demo BOOLEAN DEFAULT FALSE,
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS waiting_users_in_call_idx ON waiting_users(in_call);
CREATE INDEX IF NOT EXISTS matched_pairs_room_name_idx ON matched_pairs(room_name); 