-- Migration: add login_required to feeds (仅登录可见)
-- Run this against your D1 database before deploying the new server code.

ALTER TABLE feeds ADD COLUMN login_required INTEGER NOT NULL DEFAULT 0;
