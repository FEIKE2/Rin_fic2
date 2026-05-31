-- User bio compatibility is handled by the CLI migration step because SQLite/D1
-- cannot safely add a column only when it is missing from a plain SQL file.

--> statement-breakpoint
UPDATE `info` SET `value` = '15' WHERE `key` = 'migration_version';
