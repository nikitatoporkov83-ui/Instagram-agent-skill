PRAGMA foreign_keys = ON;

CREATE TABLE oauth_states (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  instagram_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  token_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX connections_instagram_user ON connections(instagram_user_id);

CREATE TABLE handoffs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  confirmation_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared',
  container_id TEXT,
  instagram_media_id TEXT,
  permalink TEXT,
  error TEXT,
  confirmed_at INTEGER,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX publications_pending ON publications(status, confirmed_at);

CREATE TABLE deletion_requests (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
