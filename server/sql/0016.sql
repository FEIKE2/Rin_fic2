-- Add post likes and bookmarks used by interaction endpoints

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
UPDATE `info` SET `value` = '16' WHERE `key` = 'migration_version';
