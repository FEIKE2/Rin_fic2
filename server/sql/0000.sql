-- Rin public-launch baseline schema.
-- This file intentionally replaces the pre-launch incremental migration chain.

CREATE TABLE IF NOT EXISTS `users` (
    `id` integer PRIMARY KEY NOT NULL,
    `username` text NOT NULL,
    `openid` text NOT NULL,
    `avatar` text,
    `password` text,
    `permission` integer DEFAULT 0,
    `bio` text DEFAULT '',
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feeds` (
    `id` integer PRIMARY KEY NOT NULL,
    `alias` text,
    `title` text,
    `summary` text DEFAULT '' NOT NULL,
    `ai_summary` text DEFAULT '' NOT NULL,
    `ai_summary_status` text DEFAULT 'idle' NOT NULL,
    `ai_summary_error` text DEFAULT '' NOT NULL,
    `content` text NOT NULL,
    `listed` integer DEFAULT 1 NOT NULL,
    `draft` integer DEFAULT 1 NOT NULL,
    `login_required` integer DEFAULT 0 NOT NULL,
    `top` integer DEFAULT 0 NOT NULL,
    `hot_score` real DEFAULT 0 NOT NULL,
    `hot_content_score` real DEFAULT 0 NOT NULL,
    `hot_dynamic_score` real DEFAULT 0 NOT NULL,
    `uid` integer NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`uid`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_feeds_hot_sort` ON `feeds` (`top`, `hot_score`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hashtags` (
    `id` integer PRIMARY KEY NOT NULL,
    `name` text NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feed_hashtags` (
    `feed_id` integer NOT NULL,
    `hashtag_id` integer NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`hashtag_id`) REFERENCES `hashtags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comments` (
    `id` integer PRIMARY KEY NOT NULL,
    `feed_id` integer NOT NULL,
    `parent_id` integer,
    `reply_to_id` integer,
    `reply_to_content` text DEFAULT '' NOT NULL,
    `user_id` integer,
    `content` text NOT NULL,
    `guest_name` text DEFAULT '',
    `guest_contact` text DEFAULT '',
    `approved` integer DEFAULT 1 NOT NULL,
    `like_count` integer DEFAULT 0 NOT NULL,
    `deleted_at` integer,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`reply_to_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_feed_parent_created_id` ON `comments` (`feed_id`, `parent_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_user_created_id` ON `comments` (`user_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_reply_to_id` ON `comments` (`reply_to_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_deleted_at` ON `comments` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comment_likes` (
    `id` integer PRIMARY KEY NOT NULL,
    `comment_id` integer NOT NULL,
    `user_id` integer NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `comment_likes_comment_id_user_id_unique` ON `comment_likes` (`comment_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comment_likes_comment_id` ON `comment_likes` (`comment_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comment_likes_user_comment` ON `comment_likes` (`user_id`, `comment_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feed_likes` (
    `id` integer PRIMARY KEY NOT NULL,
    `feed_id` integer NOT NULL,
    `user_id` integer NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `feed_likes_feed_id_user_id_unique` ON `feed_likes` (`feed_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_feed_likes_feed_id` ON `feed_likes` (`feed_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feed_bookmarks` (
    `id` integer PRIMARY KEY NOT NULL,
    `feed_id` integer NOT NULL,
    `user_id` integer NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `feed_bookmarks_feed_id_user_id_unique` ON `feed_bookmarks` (`feed_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_feed_bookmarks_feed_id` ON `feed_bookmarks` (`feed_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feed_edit_history` (
    `id` integer PRIMARY KEY NOT NULL,
    `feed_id` integer NOT NULL,
    `user_id` integer NOT NULL,
    `title` text,
    `content` text NOT NULL,
    `summary` text DEFAULT '',
    `edit_reason` text DEFAULT '',
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_feed_edit_history_feed_id` ON `feed_edit_history` (`feed_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_feed_edit_history_created_at` ON `feed_edit_history` (`feed_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `friends` (
    `id` integer PRIMARY KEY NOT NULL,
    `name` text NOT NULL,
    `desc` text,
    `avatar` text NOT NULL,
    `url` text NOT NULL,
    `uid` integer NOT NULL,
    `accepted` integer DEFAULT 0 NOT NULL,
    `health` text DEFAULT '' NOT NULL,
    `sort_order` integer DEFAULT 0 NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`uid`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `moments` (
    `id` integer PRIMARY KEY NOT NULL,
    `content` text NOT NULL,
    `uid` integer NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`uid`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `visits` (
    `id` integer PRIMARY KEY NOT NULL,
    `feed_id` integer NOT NULL,
    `ip` text NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `visit_stats` (
    `feed_id` integer PRIMARY KEY NOT NULL,
    `pv` integer DEFAULT 0 NOT NULL,
    `hll_data` text DEFAULT '' NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `uploads` (
    `id` integer PRIMARY KEY NOT NULL,
    `storage_key` text NOT NULL,
    `url` text NOT NULL,
    `kind` text DEFAULT 'image' NOT NULL,
    `original_name` text DEFAULT '' NOT NULL,
    `size` integer DEFAULT 0 NOT NULL,
    `mime_type` text DEFAULT '' NOT NULL,
    `uid` integer,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`uid`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uploads_storage_key_unique` ON `uploads` (`storage_key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cache` (
    `id` integer PRIMARY KEY NOT NULL,
    `key` text NOT NULL,
    `value` text NOT NULL,
    `type` text DEFAULT 'cache' NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cache_key_type_unique` ON `cache` (`key`, `type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `info` (
    `key` text NOT NULL,
    `value` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `info_key_unique` ON `info` (`key`);
--> statement-breakpoint
INSERT INTO `info` (`key`, `value`) VALUES ('migration_version', '0')
ON CONFLICT(`key`) DO UPDATE SET `value` = excluded.`value`;
