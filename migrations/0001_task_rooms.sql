CREATE TABLE IF NOT EXISTS task_rooms (
  credential_hash TEXT PRIMARY KEY,
  tasks_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
