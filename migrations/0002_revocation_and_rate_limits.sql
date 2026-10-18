ALTER TABLE task_rooms ADD COLUMN revoked_at INTEGER;

CREATE TABLE task_rate_limits (
  client_hash TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX task_rate_limits_expiry ON task_rate_limits(expires_at);
