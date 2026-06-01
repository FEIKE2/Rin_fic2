-- Add comment pagination and like count support

--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `like_count` integer DEFAULT 0 NOT NULL;

--> statement-breakpoint
UPDATE `comments`
SET `like_count` = (
    SELECT COUNT(*)
    FROM `comment_likes`
    WHERE `comment_likes`.`comment_id` = `comments`.`id`
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_feed_parent_created_id`
ON `comments` (`feed_id`, `parent_id`, `created_at`, `id`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_user_created_id`
ON `comments` (`user_id`, `created_at`, `id`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comment_likes_user_comment`
ON `comment_likes` (`user_id`, `comment_id`);

--> statement-breakpoint
UPDATE `info` SET `value` = '21' WHERE `key` = 'migration_version';
