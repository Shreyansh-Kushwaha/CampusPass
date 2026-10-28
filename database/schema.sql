-- CampusPass SQLite schema. Idempotent: safe to run on every startup.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS events (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  title                 TEXT    NOT NULL,
  description           TEXT    NOT NULL,
  category              TEXT    NOT NULL,
  venue                 TEXT    NOT NULL,
  start_datetime        TEXT    NOT NULL,
  end_datetime          TEXT    NOT NULL,
  registration_deadline TEXT    NOT NULL,
  capacity              INTEGER NOT NULL CHECK (capacity > 0),
  status                TEXT    NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'published', 'closed', 'cancelled')),
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (end_datetime > start_datetime),
  CHECK (registration_deadline <= start_datetime)
);

CREATE TABLE IF NOT EXISTS registrations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id            INTEGER NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_token        TEXT    NOT NULL UNIQUE,
  registration_status TEXT    NOT NULL DEFAULT 'confirmed'
                      CHECK (registration_status IN ('confirmed', 'cancelled')),
  registered_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  checked_in_at       TEXT,
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_events_status_start   ON events(status, start_datetime);
CREATE INDEX IF NOT EXISTS idx_events_category       ON events(category);
CREATE INDEX IF NOT EXISTS idx_registrations_event   ON registrations(event_id, registration_status);
CREATE INDEX IF NOT EXISTS idx_registrations_user    ON registrations(user_id);

-- Session store (used by the express-session SQLite store in database/sessionStore.js)
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  sess    TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
