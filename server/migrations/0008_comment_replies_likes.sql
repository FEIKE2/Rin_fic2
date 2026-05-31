-- Migration: add single-level comment replies and comment likes.
-- Run this against your D1 database before deploying the new server code.

ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS comment_likes (
    id INTEGER PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comments_feed_parent_created ON comments(feed_id, parent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
