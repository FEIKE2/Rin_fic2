-- Add cached hot scores for popular feed sorting

--> statement-breakpoint
ALTER TABLE `feeds` ADD COLUMN `hot_score` real DEFAULT 0 NOT NULL;

--> statement-breakpoint
ALTER TABLE `feeds` ADD COLUMN `hot_content_score` real DEFAULT 0 NOT NULL;

--> statement-breakpoint
ALTER TABLE `feeds` ADD COLUMN `hot_dynamic_score` real DEFAULT 0 NOT NULL;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_feeds_hot_sort` ON `feeds` (`top`, `hot_score`, `created_at`);

--> statement-breakpoint
UPDATE `info` SET `value` = '17' WHERE `key` = 'migration_version';
