-- Add login_required column for "仅登录可见" feeds

--> statement-breakpoint
ALTER TABLE `feeds` ADD COLUMN `login_required` integer DEFAULT 0 NOT NULL;

--> statement-breakpoint
UPDATE `info` SET `value` = '18' WHERE `key` = 'migration_version';
