-- Add uploads registry table for image recycling (health check, read-only)

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `uploads` (
	`id` integer PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`url` text NOT NULL,
	`uid` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`uid`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uploads_storage_key_unique` ON `uploads` (`storage_key`);

--> statement-breakpoint
UPDATE `info` SET `value` = '19' WHERE `key` = 'migration_version';
