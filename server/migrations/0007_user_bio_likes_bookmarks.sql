-- Migration: add bio to users, add feed_likes and feed_bookmarks tables
-- Run this against your D1 database before deploying the new server code.

ALTER TABLE users ADD COLUMN bio TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS feed_likes (
    id INTEGER PRIMARY KEY,
    feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(feed_id, user_id)
);

CREATE TABLE IF NOT EXISTS feed_bookmarks (
    id INTEGER PRIMARY KEY,
    feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(feed_id, user_id)
);
