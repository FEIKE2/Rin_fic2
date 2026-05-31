-- Migration: preserve reply quote targets and support soft-deleted comments.
-- Run this against your D1 database before deploying the new server code.

ALTER TABLE comments ADD COLUMN reply_to_id INTEGER REFERENCES comments(id) ON DELETE SET NULL;
ALTER TABLE comments ADD COLUMN reply_to_content TEXT DEFAULT '' NOT NULL;
ALTER TABLE comments ADD COLUMN deleted_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_comments_reply_to_id ON comments(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_comments_deleted_at ON comments(deleted_at);
