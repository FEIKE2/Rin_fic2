-- Add upload metadata used for non-image file attachments

--> statement-breakpoint
ALTER TABLE `uploads` ADD COLUMN `kind` text DEFAULT 'image' NOT NULL;

--> statement-breakpoint
ALTER TABLE `uploads` ADD COLUMN `original_name` text DEFAULT '' NOT NULL;

--> statement-breakpoint
ALTER TABLE `uploads` ADD COLUMN `size` integer DEFAULT 0 NOT NULL;

--> statement-breakpoint
ALTER TABLE `uploads` ADD COLUMN `mime_type` text DEFAULT '' NOT NULL;

--> statement-breakpoint
UPDATE `info` SET `value` = '20' WHERE `key` = 'migration_version';
