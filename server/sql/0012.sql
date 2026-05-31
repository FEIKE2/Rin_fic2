-- Add feed edit history table
-- Records all edits made to feeds for version control and audit trail

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
CREATE INDEX idx_feed_edit_history_feed_id ON feed_edit_history(feed_id);

--> statement-breakpoint
CREATE INDEX idx_feed_edit_history_created_at ON feed_edit_history(feed_id, created_at DESC);

--> statement-breakpoint
UPDATE `info` SET `value` = '12' WHERE `key` = 'migration_version';
