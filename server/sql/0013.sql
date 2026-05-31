-- Add single-level comment replies and comment likes

--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `parent_id` integer REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade;

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
CREATE INDEX IF NOT EXISTS `idx_comments_feed_parent_created` ON `comments` (`feed_id`, `parent_id`, `created_at`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comment_likes_comment_id` ON `comment_likes` (`comment_id`);

--> statement-breakpoint
UPDATE `info` SET `value` = '13' WHERE `key` = 'migration_version';
