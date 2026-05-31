-- Simplify guest comment fields: merge guest_email and guest_website into guest_contact
-- Recreate comments table to replace two fields with one

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comments_new` (
	`id` integer PRIMARY KEY NOT NULL,
	`feed_id` integer NOT NULL,
	`user_id` integer,
	`content` text NOT NULL,
	`guest_name` text DEFAULT '',
	`guest_contact` text DEFAULT '',
	`approved` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
-- Migrate existing data: merge guest_email and guest_website into guest_contact
INSERT INTO `comments_new` (`id`, `feed_id`, `user_id`, `content`, `guest_name`, `guest_contact`, `approved`, `created_at`, `updated_at`)
	SELECT
		`id`,
		`feed_id`,
		`user_id`,
		`content`,
		`guest_name`,
		CASE
			WHEN `guest_email` != '' AND `guest_website` != '' THEN `guest_email` || ' | ' || `guest_website`
			WHEN `guest_email` != '' THEN `guest_email`
			WHEN `guest_website` != '' THEN `guest_website`
			ELSE ''
		END as `guest_contact`,
		`approved`,
		`created_at`,
		`updated_at`
	FROM `comments`;

--> statement-breakpoint
DROP TABLE `comments`;

--> statement-breakpoint
ALTER TABLE `comments_new` RENAME TO `comments`;

--> statement-breakpoint
UPDATE `info` SET `value` = '11' WHERE `key` = 'migration_version';
