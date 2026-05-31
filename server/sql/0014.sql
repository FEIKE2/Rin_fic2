-- Preserve comment reply quotes and support soft-deleted comments

--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `reply_to_id` integer REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE set null;

--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `reply_to_content` text DEFAULT '' NOT NULL;

--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `deleted_at` integer;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_reply_to_id` ON `comments` (`reply_to_id`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_deleted_at` ON `comments` (`deleted_at`);

--> statement-breakpoint
UPDATE `info` SET `value` = '14' WHERE `key` = 'migration_version';
